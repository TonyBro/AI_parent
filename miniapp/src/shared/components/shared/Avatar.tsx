import React, { useState } from "react";
import { Camera } from "./icons";

/**
 * Avatar component with Telegram style fallback
 */
export function Avatar({ 
  src, 
  fallback, 
  size = "large",
  userId, // used for gradient seed
  onEdit,
  loading = false
}: { 
  src?: string, 
  fallback: string, 
  size?: "small" | "large",
  userId?: string,
  onEdit?: () => void,
  loading?: boolean
}) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
  const colors = [
    ['#81c784','#4caf50'], // green
    ['#64b5f6','#2196f3'], // blue
    ['#ba68c8','#9c27b0'], // purple
    ['#ff8a65','#f4511e'], // orange
    ['#ffd54f','#ffc107'], // yellow
    ['#4db6ac','#009688'], // teal
  ];
  
  const colorIndex = userId ? (userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length) : 0;
  const [light, dark] = colors[colorIndex];
  
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(to bottom, ${light}, ${dark})`,
    color: 'white',
    fontSize: size === 'large' ? '40px' : '16px',
    fontWeight: '600',
    textTransform: 'uppercase',
    overflow: 'hidden',
    borderRadius: '50%',
    position: 'relative',
    cursor: onEdit ? 'pointer' : 'default'
  };

  const textElement = (
    <span style={{ zIndex: 1 }}>
      {fallback ? [...fallback][0] : "?"}
    </span>
  );

  return (
    <div style={style} onClick={onEdit}>
      {textElement}
      {src && src.trim() !== "" && !error && (
        <img 
          src={src} 
          alt="" 
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 2,
            opacity: (loaded && !loading) ? 1 : (loading ? 0.3 : 0),
            transition: 'opacity 0.2s',
            borderRadius: '50%'
          }} 
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
      {onEdit && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.3)',
          zIndex: 3,
          opacity: loading ? 1 : 0,
          transition: 'opacity 0.2s',
          borderRadius: '50%'
        }}
        className="avatar-edit-overlay"
        >
          {loading ? (
            <div className="ui-loader-spinner" style={{ width: '24px', height: '24px', borderWidth: '3px' }}></div>
          ) : (
            <Camera size={size === 'large' ? 32 : 16} color="white" />
          )}
        </div>
      )}
    </div>
  );
}
