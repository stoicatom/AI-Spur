/// <reference types="vite/client" />

// CSS Modules
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// JSON imports
declare module '*.json' {
  const value: any;
  export default value;
}
