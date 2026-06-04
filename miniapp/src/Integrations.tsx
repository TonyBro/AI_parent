import React, { useEffect, useState, useCallback } from "react";
import { 
  Check, 
  Calendar,
  Ban,
  Globe
} from "lucide-react";
import {
  getIntegrations,
  createIntegration,
  getIntegrationOAuthUrl,
  patchIntegration,
  deleteIntegration,
  getWorkingHours,
  patchWorkingHours,
  testApiIntegration,
  type IntegrationDto,
  type WorkingHourDto,
} from "./api";
import { 
  Section, 
  ListItem, 
  ToggleItem, 
  Loader, 
  Button, 
  ConfirmModal, 
  ICON_SIZES, 
  HintText, 
  FormInput,
  FormTextArea,
  CustomSelect,
  FormField, 
  FormTextAreaField, 
  FormSelectField 
} from "./components";
import { useTranslation } from "./shared/i18n";

export type IntegrationsView = "active-list" | "available" | "settings" | "working-hours";

type AvailableIntegrationType = {
  type: string;
  nameKey: string;
  descKey: string;
  icon: React.ReactNode;
};

type Props = {
  botId: string;
  selectionMode?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  view?: IntegrationsView;
  onViewChange?: (view: IntegrationsView) => void;
  activeIntegration?: { dto: IntegrationDto | null, type: AvailableIntegrationType } | null;
  onActiveIntegrationChange?: (active: { dto: IntegrationDto | null, type: AvailableIntegrationType } | null) => void;
  onCanSaveChange?: (canSave: boolean) => void;
  saveRef?: React.MutableRefObject<() => void>;
  onNavigateToList?: (replace?: boolean) => void;
};

const AVAILABLE_INTEGRATIONS: AvailableIntegrationType[] = [
  {
    type: "google_calendar",
    nameKey: "miniapp.integrations_google_calendar_name",
    descKey: "miniapp.integrations_google_calendar_desc",
    icon: <Calendar size={ICON_SIZES.xlarge} color="white" />,
  },
  {
    type: "custom_api",
    nameKey: "miniapp.integrations_custom_api_name",
    descKey: "miniapp.integrations_custom_api_desc",
    icon: <Globe size={ICON_SIZES.xlarge} color="white" />,
  },
];

function IconCheck() {
  return <Check size={ICON_SIZES.medium} color="white" strokeWidth={3} />;
}

export function Integrations(props: Props) {
  const { 
    botId, 
    selectionMode, 
    selectedId, 
    onSelect,
    view: propsView,
    onViewChange,
    activeIntegration: propsActiveIntegration,
    onActiveIntegrationChange,
    onNavigateToList
  } = props;
  const { t, translateError } = useTranslation();
  const [integrations, setIntegrations] = useState<IntegrationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  
  // Local state if not provided by props
  const [localView, setLocalView] = useState<IntegrationsView>("active-list");
  const [localActiveIntegration, setLocalActiveIntegration] = useState<{ dto: IntegrationDto | null, type: AvailableIntegrationType } | null>(null);

  const view = propsView || localView;
  const setView = onViewChange || setLocalView;
  const activeIntegration = propsActiveIntegration || localActiveIntegration;
  const setActiveIntegration = onActiveIntegrationChange || setLocalActiveIntegration;

  const [workingHours, setWorkingHours] = useState<WorkingHourDto[]>([]);
  const [hoursLoading, setHoursLoading] = useState(false);

  // Custom API settings state
  const [apiSettings, setApiSettings] = useState({
    displayName: "",
    apiUrl: "",
    httpMethod: "GET" as "GET" | "POST",
    authType: "none" as "none" | "bearer" | "api_key",
    authToken: "",
    requestBody: "",
    aiPrompt: "",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasTestedSuccessfully, setHasTestedSuccessfully] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteIntegrationId, setDeleteIntegrationId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [botId]);

  useEffect(() => {
    if (view === "working-hours") {
      loadWorkingHours();
    }
  }, [view, botId]);

  async function loadWorkingHours() {
    try {
      setHoursLoading(true);
      const hours = await getWorkingHours(botId);
      // Initialize with all days if empty
      if (hours.length === 0) {
        const defaultHours = Array.from({ length: 7 }, (_, i) => ({
          day_of_week: i,
          start_time: "09:00",
          end_time: "18:00",
          is_enabled: i > 0 && i < 6, // Mon-Fri enabled by default
        }));
        setWorkingHours(defaultHours);
      } else {
        // Ensure all days are present
        const fullHours = Array.from({ length: 7 }, ( _, i) => {
          const existing = hours.find(h => h.day_of_week === i);
          return existing || {
            day_of_week: i,
            start_time: "09:00",
            end_time: "18:00",
            is_enabled: false,
          };
        });
        setWorkingHours(fullHours);
      }
    } catch (e) {
      console.error("Failed to load working hours", e);
    } finally {
      setHoursLoading(false);
    }
  }

  const handleSaveWorkingHours = useCallback(async () => {
    try {
      setSaving(true);
      setStatus(t("miniapp.saving"));
      await patchWorkingHours(botId, workingHours);
      setView("settings");
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }, [botId, workingHours, setView, t, translateError]);

  useEffect(() => {
    if (props.saveRef) {
      if (view === "working-hours") {
        props.saveRef.current = handleSaveWorkingHours;
      } else if (view === "settings" && activeIntegration?.type.type === "custom_api") {
        props.saveRef.current = handleSaveApiSettings;
      }
    }
    if (props.onCanSaveChange) {
      const shouldShowSave = view === "working-hours" || (view === "settings" && activeIntegration?.type.type === "custom_api");
      props.onCanSaveChange(shouldShowSave);
    }
  }, [view, workingHours, activeIntegration, apiSettings]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const ints = await getIntegrations(botId);
      setIntegrations(ints);
      
      // Update active integration if we're in settings view
      if (activeIntegration) {
        const updated = ints.find(i => i.integration_type === activeIntegration.type.type);
        setActiveIntegration({ dto: updated || null, type: activeIntegration.type });
      }
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setLoading(false);
    }
  }, [botId, translateError, activeIntegration, setActiveIntegration]);

  const handleConnect = useCallback(async (integrationType: string) => {
    try {
      setError(null);
      setConnecting(integrationType);

      // For custom_api, always create a new integration (allow multiple)
      // For OAuth integrations (like Google Calendar), reuse existing one
      let integration = integrations.find((i) => i.integration_type === integrationType);
      const shouldCreateNew = !integration || integrationType === "custom_api";
      
      if (shouldCreateNew) {
        const availableInt = AVAILABLE_INTEGRATIONS.find((a) => a.type === integrationType);
        if (!availableInt) throw new Error("Unknown integration type");

        const result = await createIntegration(botId, {
          integration_type: integrationType,
          display_name: t(availableInt.nameKey),
        });

        // Reload to get the new integration
        const ints = await getIntegrations(botId);
        setIntegrations(ints);
        integration = ints.find((i) => i.id === result.id);
      }

      if (!integration) throw new Error("Failed to create integration");

      // For custom_api, go to settings view immediately
      if (integrationType === "custom_api") {
        const availableInt = AVAILABLE_INTEGRATIONS.find((a) => a.type === integrationType);
        if (availableInt) {
          setActiveIntegration({ dto: integration, type: availableInt });
          setView("settings");
          // Load existing settings if any
          if (integration.settings && typeof integration.settings === "object") {
            const settings = integration.settings as any;
            setApiSettings({
              displayName: settings.displayName || integration.display_name || "",
              apiUrl: settings.apiUrl || "",
              httpMethod: settings.httpMethod || "GET",
              authType: settings.authType || "none",
              authToken: settings.authToken || "",
              requestBody: settings.requestBody || "",
              aiPrompt: settings.aiPrompt || "",
            });
            // If settings exist with URL, mark as already tested
            setHasTestedSuccessfully(Boolean(settings.apiUrl));
          } else {
            // Reset test state for new integration
            setHasTestedSuccessfully(false);
          }
        }
        setConnecting(null);
        return;
      }

      // OAuth flow for other integrations
      const response = await getIntegrationOAuthUrl(botId, integration.id);
      const { url } = response;

      // Use Telegram's native link opener if available
      if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(url);
      } else {
        const popup = window.open(url, "_blank", "width=600,height=700");
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          setError(t("miniapp.popup_blocked"));
          setConnecting(null);
          return;
        }
      }

      // Poll for connection status
      const pollInterval = setInterval(async () => {
        const ints = await getIntegrations(botId);
        const updated = ints.find((i) => i.id === integration!.id);
        if (updated?.is_connected) {
          clearInterval(pollInterval);
          setIntegrations(ints);
          setConnecting(null);
          if (view === "settings" && activeIntegration?.type.type === integrationType) {
            setActiveIntegration({ dto: updated, type: activeIntegration.type });
          }
        }
      }, 3000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setConnecting(null);
      }, 5 * 60 * 1000);
    } catch (e: any) {
      setError(translateError(e));
      setConnecting(null);
    }
  }, [botId, integrations, setIntegrations, setActiveIntegration, setView, t, translateError, view, activeIntegration]);

  const handleTestApi = useCallback(async () => {
    // Validation
    if (!apiSettings.apiUrl) {
      setError(t("miniapp.api_url_required"));
      return;
    }

    if (!apiSettings.apiUrl.startsWith("http://") && !apiSettings.apiUrl.startsWith("https://")) {
      setError(t("miniapp.api_url_invalid"));
      return;
    }

    if ((apiSettings.authType === "bearer" || apiSettings.authType === "api_key") && !apiSettings.authToken) {
      setError(t("miniapp.api_token_required"));
      return;
    }

    if (apiSettings.httpMethod === "POST" && apiSettings.requestBody) {
      try {
        JSON.parse(apiSettings.requestBody);
      } catch (e) {
        setError(t("miniapp.api_request_body_invalid"));
        return;
      }
    }

    try {
      setTesting(true);
      setError(null);
      setTestResult(null);
      
      const result = await testApiIntegration(botId, apiSettings);
      
      if (result.ok) {
        setTestResult({ success: true, message: t("miniapp.api_test_success") });
        setHasTestedSuccessfully(true);
      } else {
        setTestResult({ success: false, message: t("miniapp.api_test_failed", { error: result.error || "Unknown error" }) });
        setHasTestedSuccessfully(false);
      }
    } catch (e: any) {
      setTestResult({ success: false, message: t("miniapp.api_test_failed", { error: translateError(e) }) });
      setHasTestedSuccessfully(false);
    } finally {
      setTesting(false);
    }
  }, [apiSettings, botId, t, translateError]);

  const handleSaveApiSettings = useCallback(async () => {
    if (!activeIntegration?.dto) return;

    // Validation
    if (!apiSettings.apiUrl) {
      setError(t("miniapp.api_url_required"));
      return;
    }

    if (!apiSettings.apiUrl.startsWith("http://") && !apiSettings.apiUrl.startsWith("https://")) {
      setError(t("miniapp.api_url_invalid"));
      return;
    }

    if ((apiSettings.authType === "bearer" || apiSettings.authType === "api_key") && !apiSettings.authToken) {
      setError(t("miniapp.api_token_required"));
      return;
    }

    if (apiSettings.httpMethod === "POST" && apiSettings.requestBody) {
      try {
        JSON.parse(apiSettings.requestBody);
      } catch (e) {
        setError(t("miniapp.api_request_body_invalid"));
        return;
      }
    }

    try {
      setSaving(true);
      setStatus(t("miniapp.testing_api"));
      setError(null);
      
      // Test the API first before saving
      const testResult = await testApiIntegration(botId, apiSettings);
      
      if (!testResult.ok) {
        setError(t("miniapp.api_test_failed", { error: testResult.error || "Unknown error" }));
        setSaving(false);
        setStatus("");
        return;
      }
      
      // If test succeeds, save the settings
      setStatus(t("miniapp.saving"));
      
      await patchIntegration(botId, activeIntegration.dto.id, {
        display_name: apiSettings.displayName || t("miniapp.integrations_custom_api_name"),
        settings: apiSettings,
      });
      
      await loadData();
      
      // Navigate back to the list, removing settings page from history
      if (onNavigateToList) {
        onNavigateToList(true);
      } else {
        setView("active-list");
      }
      
      // Clear active integration and test state after successful save
      setActiveIntegration(null);
      setHasTestedSuccessfully(false);
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }, [activeIntegration, apiSettings, botId, loadData, onNavigateToList, setActiveIntegration, setView, t, translateError]);

  const handleDisconnect = useCallback(async (integrationId: string) => {
    try {
      setSaving(true);
      setStatus(t("miniapp.saving"));
      setError(null);
      await deleteIntegration(botId, integrationId);
      await loadData();
      
      // Use custom navigation handler with replace if provided
      if (onNavigateToList) {
        onNavigateToList(true);
      } else {
        setView("active-list");
      }
      
      setActiveIntegration(null);
      setShowDeleteModal(false);
      setDeleteIntegrationId(null);
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }, [botId, loadData, onNavigateToList, setActiveIntegration, setView, t, translateError]);

  if (loading) {
    return <Loader text={t("miniapp.loading")} />;
  }

  const renderContent = () => {
    if (view === "settings" && activeIntegration) {
      const isConnected = activeIntegration.dto?.is_connected || false;
      const isConnecting = connecting === activeIntegration.type.type;

      // Custom API settings form
      if (activeIntegration.type.type === "custom_api") {
        return (
          <div>
            <Section title={t("miniapp.integrations_settings")}>
              <div style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>{activeIntegration.type.icon}</div>
                <h3 style={{ margin: '0 0 8px', fontSize: '20px' }}>{t(activeIntegration.type.nameKey)}</h3>
                <p style={{ margin: '0', color: 'var(--muted)', fontSize: '14px' }}>{t(activeIntegration.type.descKey)}</p>
              </div>
            </Section>
              
            <Section title={t("miniapp.integration_display_name")}>
              <FormInput
                type="text"
                placeholder={t("miniapp.integration_display_name_placeholder")}
                value={apiSettings.displayName}
                onChange={(e) => {
                  setApiSettings({ ...apiSettings, displayName: e.target.value });
                }}
              />
            </Section>

            <Section title={t("miniapp.api_url")}>
              <FormInput
                type="text"
                placeholder={t("miniapp.api_url_placeholder")}
                value={apiSettings.apiUrl}
                onChange={(e) => {
                  setApiSettings({ ...apiSettings, apiUrl: e.target.value });
                  setTestResult(null);
                  setHasTestedSuccessfully(false);
                }}
              />
            </Section>

            <Section title={t("miniapp.http_method")} contentClassName="ui-section-padded">
              <CustomSelect
                value={apiSettings.httpMethod}
                onChange={(val) => {
                  setApiSettings({ ...apiSettings, httpMethod: val as "GET" | "POST" });
                  setTestResult(null);
                  setHasTestedSuccessfully(false);
                }}
                options={[
                  { value: "GET", label: "GET" },
                  { value: "POST", label: "POST" },
                ]}
              />
            </Section>

            <Section title={t("miniapp.auth_type")} contentClassName="ui-section-padded">
              <CustomSelect
                value={apiSettings.authType}
                onChange={(val) => {
                  setApiSettings({ ...apiSettings, authType: val as "none" | "bearer" | "api_key" });
                  setTestResult(null);
                  setHasTestedSuccessfully(false);
                }}
                options={[
                  { value: "none", label: t("miniapp.auth_none") },
                  { value: "bearer", label: t("miniapp.auth_bearer") },
                  { value: "api_key", label: t("miniapp.auth_api_key") },
                ]}
              />
            </Section>

            {(apiSettings.authType === "bearer" || apiSettings.authType === "api_key") && (
              <Section title={t("miniapp.auth_token")}>
                <FormInput
                  type="text"
                  placeholder={t("miniapp.auth_token_placeholder")}
                  value={apiSettings.authToken}
                  onChange={(e) => {
                    setApiSettings({ ...apiSettings, authToken: e.target.value });
                    setTestResult(null);
                    setHasTestedSuccessfully(false);
                  }}
                />
              </Section>
            )}

            {apiSettings.httpMethod === "POST" && (
              <Section title={t("miniapp.request_body")}>
                <FormTextArea
                  placeholder={t("miniapp.request_body_placeholder")}
                  value={apiSettings.requestBody}
                  onChange={(e) => {
                    setApiSettings({ ...apiSettings, requestBody: e.target.value });
                    setTestResult(null);
                    setHasTestedSuccessfully(false);
                  }}
                  rows={4}
                />
              </Section>
            )}

            <Section title={t("miniapp.ai_prompt_api")}>
              <FormTextArea
                placeholder={t("miniapp.ai_prompt_api_placeholder")}
                value={apiSettings.aiPrompt}
                onChange={(e) => {
                  setApiSettings({ ...apiSettings, aiPrompt: e.target.value });
                  setTestResult(null);
                  setHasTestedSuccessfully(false);
                }}
                rows={3}
              />
            </Section>

            <Section>
              <div style={{ padding: '0 16px 16px' }}>
                <Button
                  onClick={handleTestApi}
                  disabled={testing}
                  fullWidth
                >
                  {testing ? t("miniapp.testing_api") : t("miniapp.try_api")}
                </Button>

                {testResult && (
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    marginTop: '12px',
                    backgroundColor: testResult.success ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                    color: testResult.success ? '#4caf50' : '#f44336',
                    fontSize: '14px',
                  }}>
                    {testResult.message}
                  </div>
                )}
              </div>
            </Section>

            {activeIntegration.dto && (
              <Section>
                <div style={{ padding: '0 16px 16px' }}>
                  <Button
                    onClick={() => {
                      setDeleteIntegrationId(activeIntegration.dto!.id);
                      setShowDeleteModal(true);
                    }}
                    disabled={saving}
                    variant="danger"
                    fullWidth
                  >
                    {t("miniapp.integrations_delete")}
                  </Button>
                </div>
              </Section>
            )}
            
            {error && <p className="error" style={{ padding: '16px', color: 'var(--tg-red)', margin: 0 }}>{error}</p>}
            
            <ConfirmModal
              isOpen={showDeleteModal}
              title={t("miniapp.delete_integration_title")}
              message={t("miniapp.delete_integration_confirm")}
              confirmText={t("miniapp.delete")}
              cancelText={t("miniapp.cancel")}
              onConfirm={() => deleteIntegrationId && handleDisconnect(deleteIntegrationId)}
              onCancel={() => {
                setShowDeleteModal(false);
                setDeleteIntegrationId(null);
              }}
              variant="danger"
            />
          </div>
        );
      }

      // OAuth integrations (Google Calendar, etc.)
      return (
        <div>
          <Section title={t("miniapp.integrations_settings")}>
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>{activeIntegration.type.icon}</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '20px' }}>{t(activeIntegration.type.nameKey)}</h3>
              <p style={{ margin: '0', color: 'var(--muted)', fontSize: '14px' }}>{t(activeIntegration.type.descKey)}</p>
            </div>
            
            <div className="divider" />
            
            {isConnected && activeIntegration.type.type === "google_calendar" && (
              <>
                <ListItem
                  label={t("miniapp.integrations_working_hours")}
                  onClick={() => setView("working-hours")}
                />
                <div className="divider" />
              </>
            )}

            <ListItem
              label={t("miniapp.integrations_reconnect")}
              onClick={() => handleConnect(activeIntegration.type.type)}
              isAction
              trailing={isConnecting ? t("miniapp.loading") : null}
            />
            {activeIntegration.dto && (
              <ListItem
                label={t("miniapp.integrations_delete")}
                onClick={() => handleDisconnect(activeIntegration.dto!.id)}
                isDanger
              />
            )}
          </Section>
          {error && <p className="error" style={{ padding: '16px', color: 'var(--tg-red)', margin: 0 }}>{error}</p>}
        </div>
      );
    }

    if (view === "working-hours") {
      const days = [
        t("miniapp.day_sunday"),
        t("miniapp.day_monday"),
        t("miniapp.day_tuesday"),
        t("miniapp.day_wednesday"),
        t("miniapp.day_thursday"),
        t("miniapp.day_friday"),
        t("miniapp.day_saturday"),
      ];

      if (hoursLoading) {
        return <Loader text={t("miniapp.loading")} />;
      }

      return (
        <div>
          <Section title={t("miniapp.integrations_working_hours")}>
            {workingHours.map((h, i) => (
              <div key={h.day_of_week} style={{ borderBottom: i < 6 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ padding: '12px 16px' }}>
                  <ToggleItem
                    label={days[h.day_of_week]}
                    checked={h.is_enabled}
                    onChange={(val) => {
                      const newHours = [...workingHours];
                      newHours[i].is_enabled = val;
                      setWorkingHours(newHours);
                    }}
                  />
                  {h.is_enabled && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <HintText style={{ marginBottom: '4px' }}>{t("miniapp.working_hours_from")}</HintText>
                        <FormInput
                          type="time"
                          value={h.start_time}
                          onChange={(e) => {
                            const newHours = [...workingHours];
                            newHours[i].start_time = e.target.value;
                            setWorkingHours(newHours);
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <HintText style={{ marginBottom: '4px' }}>{t("miniapp.working_hours_to")}</HintText>
                        <FormInput
                          type="time"
                          value={h.end_time}
                          onChange={(e) => {
                            const newHours = [...workingHours];
                            newHours[i].end_time = e.target.value;
                            setWorkingHours(newHours);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Section>
          <HintText style={{ padding: '0 16px', fontSize: '13px' }}>
            {t("miniapp.working_hours_hint")}
          </HintText>
        </div>
      );
    }

    // Selection mode (for broadcasts)
    if (selectionMode) {
      const connectedIntegrations = integrations.filter(i => i.is_connected);
      
      return (
        <div>
          {error && <p className="error" style={{ padding: '16px', color: 'var(--tg-red)', margin: 0 }}>{error}</p>}

          <Section title={t("miniapp.select_integration")}>
            <ListItem
              icon={<Ban size={ICON_SIZES.large} color="white" />}
              label={t("miniapp.none")}
              subtitle={t("miniapp.no_integration_selected")}
              onClick={() => onSelect?.(null)}
              trailing={!selectedId ? <Check size={ICON_SIZES.small} color="#64b5f6" strokeWidth={3} /> : null}
            />
          </Section>

          <Section title={t("miniapp.integrations_available")}>
            <div style={{ padding: '0' }}>
              {connectedIntegrations.map((integration) => {
                const availableInt = AVAILABLE_INTEGRATIONS.find((a) => a.type === integration.integration_type);
                if (!availableInt) return null;
                
                const isSelected = selectedId === integration.id;
                
                // Use custom display name if available (from settings), otherwise use default translation
                const displayName = integration.display_name || t(availableInt.nameKey);
                
                return (
                  <ListItem
                    key={integration.id}
                    icon={availableInt.icon}
                    label={displayName}
                    subtitle={t(availableInt.descKey)}
                    onClick={() => onSelect?.(integration.id)}
                    trailing={isSelected ? <Check size={ICON_SIZES.small} color="#64b5f6" strokeWidth={3} /> : null}
                  />
                );
              })}
              {connectedIntegrations.length === 0 && (
                <HintText style={{ textAlign: 'center', padding: '16px' }}>
                  {t("miniapp.no_connected_integrations")}
                </HintText>
              )}
            </div>
          </Section>
        </div>
      );
    }

    // View: Active integrations list
    if (view === "active-list") {
      const activeIntegrations = integrations.filter(i => i.is_connected);
      
      // If no active integrations, show available integrations page
      if (activeIntegrations.length === 0) {
        return (
          <div>
            {error && <p className="error" style={{ padding: '16px', color: 'var(--tg-red)', margin: 0 }}>{error}</p>}
            
            <Section title={t("miniapp.integrations_available")}>
              <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
                {AVAILABLE_INTEGRATIONS.map((availableInt) => {
                  const existing = integrations.find((i) => i.integration_type === availableInt.type);
                  const isConnected = existing?.is_connected || false;

                  return (
                    <div
                      key={availableInt.type}
                      onClick={() => {
                        setActiveIntegration({ dto: existing || null, type: availableInt });
                        handleConnect(availableInt.type);
                      }}
                      style={{
                        padding: "16px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid var(--border)",
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                      }}
                    >
                      <div>{availableInt.icon}</div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '16px' }}>{t(availableInt.nameKey)}</h4>
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>{t(availableInt.descKey)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        );
      }

      // Show active integrations list
      return (
        <div>
          {error && <p className="error" style={{ padding: '16px', color: 'var(--tg-red)', margin: 0 }}>{error}</p>}
          
          <Section title={t("miniapp.integrations_connected")}>
            {activeIntegrations.map((integration) => {
              const availableInt = AVAILABLE_INTEGRATIONS.find(a => a.type === integration.integration_type);
              if (!availableInt) return null;

              // Use custom display name if available
              const displayName = integration.display_name || t(availableInt.nameKey);

              return (
                <ListItem
                  key={integration.id}
                  icon={availableInt.icon}
                  label={displayName}
                  subtitle={t(availableInt.descKey)}
                  onClick={() => {
                    setActiveIntegration({ dto: integration, type: availableInt });
                    setView("settings");
                    // Load existing settings for custom_api
                    if (integration.integration_type === "custom_api" && integration.settings && typeof integration.settings === "object") {
                      const settings = integration.settings as any;
                      setApiSettings({
                        displayName: settings.displayName || integration.display_name || "",
                        apiUrl: settings.apiUrl || "",
                        httpMethod: settings.httpMethod || "GET",
                        authType: settings.authType || "none",
                        authToken: settings.authToken || "",
                        requestBody: settings.requestBody || "",
                        aiPrompt: settings.aiPrompt || "",
                      });
                    }
                  }}
                  trailing={<Check size={ICON_SIZES.small} color="#4caf50" strokeWidth={3} />}
                />
              );
            })}
          </Section>

          {/* Allow adding more custom API integrations */}
          <Section title={t("miniapp.integrations_add_new")}>
            <ListItem
              icon={<Globe size={ICON_SIZES.xlarge} color="white" />}
              label={t("miniapp.integrations_custom_api_name")}
              subtitle={t("miniapp.integrations_custom_api_desc")}
              onClick={() => {
                const customApiType = AVAILABLE_INTEGRATIONS.find(a => a.type === "custom_api");
                if (customApiType) {
                  setActiveIntegration({ dto: null, type: customApiType });
                  handleConnect("custom_api");
                }
              }}
            />
          </Section>
        </div>
      );
    }

    // View: Available integrations (to add new ones)
    if (view === "available") {
      return (
        <div>
          {error && <p className="error" style={{ padding: '16px', color: 'var(--tg-red)', margin: 0 }}>{error}</p>}
          
          <Section title={t("miniapp.integrations_available")}>
            <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
              {AVAILABLE_INTEGRATIONS.map((availableInt) => {
                const existingIntegrations = integrations.filter((i) => i.integration_type === availableInt.type);
                const hasAny = existingIntegrations.length > 0;
                const isConnected = existingIntegrations.some(i => i.is_connected);

                return (
                  <div key={availableInt.type}>
                    <div
                      onClick={() => {
                        // For custom_api with existing integrations, go to active-list to select which one to edit
                        if (availableInt.type === "custom_api" && hasAny) {
                          setView("active-list");
                        } else if (isConnected) {
                          // For other types, open the first connected one
                          setActiveIntegration({ dto: existingIntegrations[0], type: availableInt });
                          setView("settings");
                        } else {
                          // Create new integration
                          handleConnect(availableInt.type);
                        }
                      }}
                      style={{
                        padding: "16px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid var(--border)",
                        borderRadius: '12px',
                        position: 'relative',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                      }}
                    >
                      <div>{availableInt.icon}</div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '16px' }}>{t(availableInt.nameKey)}</h4>
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>{t(availableInt.descKey)}</p>
                        {availableInt.type === "custom_api" && existingIntegrations.length > 0 && (
                          <p style={{ margin: '4px 0 0', color: 'var(--accent)', fontSize: '12px' }}>
                            {t("miniapp.integrations_count", { count: existingIntegrations.length })}
                          </p>
                        )}
                      </div>
                      {isConnected && (
                        <div style={{ position: 'absolute', top: '12px', right: '12px', color: '#4caf50' }}>
                          <IconCheck />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      );
    }

    // Fallback - should not reach here
    return null;
  };

  return (
    <>
      {saving && <Loader fullscreen text={status} />}
      {renderContent()}
    </>
  );
}
