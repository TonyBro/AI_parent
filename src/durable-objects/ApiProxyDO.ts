import { DurableObject } from "cloudflare:workers";

/**
 * Durable Object for coordinating external API requests
 * Implements rate limiting, request queuing, and response caching
 */
export class ApiProxyDO extends DurableObject {
  private requestQueue: Array<{
    id: string;
    apiUrl: string;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 100; // Minimum 100ms between requests

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    console.log(`[ApiProxyDO] Received request: ${pathname}`);

    if (pathname === "/proxy") {
      return await this.handleProxyRequest(request);
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Handle proxied API request with rate limiting and caching
   */
  private async handleProxyRequest(request: Request): Promise<Response> {
    try {
      const body = await request.json() as {
        apiUrl: string;
        httpMethod: "GET" | "POST";
        headers?: Record<string, string>;
        requestBody?: string;
        timeout?: number;
        cacheKey?: string;
        cacheTTL?: number;
      };

      const {
        apiUrl,
        httpMethod,
        headers = {},
        requestBody,
        timeout = 10000,
        cacheKey,
        cacheTTL = 60, // Default 60 seconds cache
      } = body;

      console.log(`[ApiProxyDO] Processing request:`, {
        apiUrl,
        httpMethod,
        cacheKey,
        queueLength: this.requestQueue.length,
      });

      // Check cache first if cacheKey is provided
      if (cacheKey) {
        const cached = await this.ctx.storage.get<string>(`cache:${cacheKey}`);
        if (cached) {
          try {
            const cacheEntry = JSON.parse(cached);
            const age = Date.now() - cacheEntry.timestamp;
            
            // Check if cache is still valid
            if (age < cacheEntry.ttl) {
              return new Response(cacheEntry.data, {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "X-Cache": "HIT",
                  "X-Cache-Age": String(Math.floor(age / 1000)),
                },
              });
            } else {
              // Cache expired, delete it
              console.log(`[ApiProxyDO] Cache expired for: ${cacheKey}`);
              await this.ctx.storage.delete(`cache:${cacheKey}`);
            }
          } catch (e) {
            // Invalid cache entry, delete it
            await this.ctx.storage.delete(`cache:${cacheKey}`);
          }
        }
      }

      // Add request to queue and wait for execution
      const result = await this.queueAndExecuteRequest(
        apiUrl,
        httpMethod,
        headers,
        requestBody,
        timeout
      );

      // Cache successful responses
      if (cacheKey && result.status >= 200 && result.status < 300) {
        // Store with timestamp for manual TTL management
        await this.ctx.storage.put(`cache:${cacheKey}`, JSON.stringify({
          data: result.body,
          timestamp: Date.now(),
          ttl: cacheTTL * 1000, // Convert to milliseconds
        }));
      }

      return new Response(result.body, {
        status: result.status,
        headers: {
          "Content-Type": result.contentType || "application/json",
          "X-Cache": "MISS",
        },
      });
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  /**
   * Queue request and ensure rate limiting
   */
  private async queueAndExecuteRequest(
    apiUrl: string,
    httpMethod: string,
    headers: Record<string, string>,
    requestBody?: string,
    timeout = 10000
  ): Promise<{ status: number; body: string; contentType: string | null }> {
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        id: requestId,
        apiUrl,
        resolve: (result) => resolve(result),
        reject: (error) => reject(error),
      });

      // Start processing queue if not already processing
      if (!this.processing) {
        this.processQueue(httpMethod, headers, requestBody, timeout);
      }
    });
  }

  /**
   * Process queued requests with rate limiting
   */
  private async processQueue(
    httpMethod: string,
    headers: Record<string, string>,
    requestBody?: string,
    timeout = 10000
  ): Promise<void> {
    this.processing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (!request) continue;

      // Enforce minimum interval between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
        const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        // Execute the actual API call
        const result = await this.executeApiCall(
          request.apiUrl,
          httpMethod,
          headers,
          requestBody,
          timeout
        );
        this.lastRequestTime = Date.now();
        console.log(`[ApiProxyDO] API call completed:`, {
          url: request.apiUrl,
          status: result.status,
          queueRemaining: this.requestQueue.length,
        });
        request.resolve(result);
      } catch (error: any) {
        request.reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * Execute actual API call
   */
  private async executeApiCall(
    apiUrl: string,
    httpMethod: string,
    headers: Record<string, string>,
    requestBody?: string,
    timeout = 10000
  ): Promise<{ status: number; body: string; contentType: string | null }> {
    const fetchOptions: RequestInit = {
      method: httpMethod,
      headers,
    };

    if (httpMethod === "POST" && requestBody) {
      fetchOptions.body = requestBody;
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout")), timeout);
    });

    try {
      const response = await Promise.race([
        fetch(apiUrl, fetchOptions),
        timeoutPromise,
      ]) as Response;

      const contentType = response.headers.get("content-type");
      const body = await response.text();

      return {
        status: response.status,
        body,
        contentType,
      };
    } catch (error: any) {
      throw new Error(`API call failed: ${error.message}`);
    }
  }

  /**
   * Clear cache entries (can be called for cleanup)
   */
  async clearCache(pattern?: string): Promise<void> {
    const keys = await this.ctx.storage.list({ prefix: "cache:" });
    const keysToDelete: string[] = [];

    for (const [key] of keys) {
      if (!pattern || key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }

    await this.ctx.storage.delete(keysToDelete);
  }
}
