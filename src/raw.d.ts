declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.yaml?raw" {
  const content: string;
  export default content;
}
