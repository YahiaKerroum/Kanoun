declare const config: {
  readonly appId: string;
  readonly productName: string;
  readonly directories: { readonly output: string };
  readonly files: readonly string[];
  readonly extraResources: readonly {
    readonly from: string;
    readonly to: string;
    readonly filter?: readonly string[];
  }[];
  readonly win: { readonly target: readonly string[] };
  readonly nsis: {
    readonly oneClick: boolean;
    readonly allowToChangeInstallationDirectory: boolean;
    readonly createDesktopShortcut: boolean;
  };
};
export = config;
