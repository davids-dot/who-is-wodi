/// <reference types="vite/client" />

declare const __APP_KEY__: string

declare module '*.module.less' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.less' {
  const content: string;
  export default content;
}
