/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Project id used for uploads and search. Defaults to proj_cutonce_demo. */
  readonly VITE_PROJECT_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
