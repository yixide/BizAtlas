declare module 'virtual:atlas-functions' {
  const functions: Record<string, import('./map/store').Fn[]>;
  export default functions;
}
declare module 'virtual:atlas-process' {
  const process: import('./map/store').Process;
  export default process;
}
declare module 'virtual:atlas-tables' {
  const tables: Record<string, import('./map/store').TableDef>;
  export default tables;
}
declare module 'virtual:atlas-architecture' {
  const architecture: import('./map/arch').Architecture;
  export default architecture;
}
declare module 'virtual:atlas-projects' {
  const projects: { current: string; list: { id: string; name: string }[] };
  export default projects;
}
declare module 'virtual:atlas-map' {
  const map: import('./model').AtlasMap;
  export default map;
}
