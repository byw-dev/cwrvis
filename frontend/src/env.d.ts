/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_GRID_BASE: string
  readonly VITE_SHAPES_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
