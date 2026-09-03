/// <reference types="vite/client" />
declare const __ATELIER_EDITION__: "public" | "owner"
declare module 'lucide-react' {
  import type { ComponentType, SVGProps } from 'react'
  type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
  export const AlertTriangle: Icon; export const Check: Icon; export const ChevronRight: Icon; export const Clipboard: Icon; export const Download: Icon; export const FolderUp: Icon; export const GitBranch: Icon
  export const Package: Icon; export const Plus: Icon; export const RotateCcw: Icon; export const Save: Icon; export const Search: Icon; export const SlidersHorizontal: Icon
  export const Sparkles: Icon; export const Tags: Icon; export const Trash2: Icon; export const Undo2: Icon; export const Users: Icon; export const X: Icon; export const ExternalLink: Icon; export const Image: Icon; export const Link2: Icon
}
