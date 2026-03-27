import packageJson from "../../package.json" with { type: "json" };

export const currentVersion = `devtools/${packageJson.version}`;
