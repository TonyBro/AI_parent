import React from "react";
import { 
  Info, 
  HelpCircle, 
  Megaphone, 
  Terminal, 
  Puzzle, 
  Plus, 
  ExternalLink, 
  GripVertical, 
  X,
  Key,
  Camera
} from "lucide-react";
import { ICON_SIZES } from "./constants";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

export function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconInfo({ size = ICON_SIZES.large, color = "white", strokeWidth = 2, style }: IconProps) {
  return <Info size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export function IconQuiz({ size = ICON_SIZES.large, color = "white", strokeWidth = 2, style }: IconProps) {
  return <HelpCircle size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export function IconBroadcast({ size = ICON_SIZES.large, color = "white", strokeWidth = 2, style }: IconProps) {
  return <Megaphone size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export function IconCommands({ size = ICON_SIZES.large, color = "white", strokeWidth = 2, style }: IconProps) {
  return <Terminal size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export function IconIntegrations({ size = ICON_SIZES.large, color = "white", strokeWidth = 2, style }: IconProps) {
  return <Puzzle size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export function IconPlus({ style, size = ICON_SIZES.medium, color = "white" }: IconProps) {
  return <Plus size={size} color={color} strokeWidth={2.5} style={style} />;
}

export function IconExternalLink({ size = ICON_SIZES.medium, color = "white", strokeWidth = 2, style }: IconProps) {
  return <ExternalLink size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export function IconDrag({ style, size = ICON_SIZES.small, color = "white" }: IconProps) {
  return <GripVertical size={size} color={color} strokeWidth={2} style={{ opacity: 0.5, ...style }} />;
}

export function IconCross({ style, size = ICON_SIZES.small, color = "white" }: IconProps) {
  return <X size={size} color={color} strokeWidth={3} style={style} />;
}

export { Key, Camera };
