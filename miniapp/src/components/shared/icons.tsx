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

export function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconInfo() {
  return <Info size={ICON_SIZES.large} color="white" strokeWidth={2} />;
}

export function IconQuiz() {
  return <HelpCircle size={ICON_SIZES.large} color="white" strokeWidth={2} />;
}

export function IconBroadcast() {
  return <Megaphone size={ICON_SIZES.large} color="white" strokeWidth={2} />;
}

export function IconCommands() {
  return <Terminal size={ICON_SIZES.large} color="white" strokeWidth={2} />;
}

export function IconIntegrations() {
  return <Puzzle size={ICON_SIZES.large} color="white" strokeWidth={2} />;
}

export function IconPlus({ style, size = ICON_SIZES.medium, color = "white" }: { style?: React.CSSProperties, size?: number, color?: string }) {
  return <Plus size={size} color={color} strokeWidth={2.5} style={style} />;
}

export function IconExternalLink() {
  return <ExternalLink size={ICON_SIZES.medium} color="white" strokeWidth={2} />;
}

export function IconDrag({ style }: { style?: React.CSSProperties }) {
  return <GripVertical size={ICON_SIZES.small} color="white" strokeWidth={2} style={{ opacity: 0.5, ...style }} />;
}

export function IconCross({ style }: { style?: React.CSSProperties }) {
  return <X size={ICON_SIZES.small} color="white" strokeWidth={3} style={style} />;
}

export { Key, Camera };
