/** Keep semicolons inside quoted font URLs intact while removing whole import rules. */
export function stripCssImports(css:string):string {
  return css.replace(/@import\s+(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"[^"]*"|'[^']*')[^;]*;/gi,'');
}
