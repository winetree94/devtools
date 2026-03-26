import { readFile } from "node:fs/promises";

type PackageMetadata = Readonly<{
  version?: string;
}>;

const packageJsonUrl = new URL("../../package.json", import.meta.url);

let packageMetadataPromise: Promise<PackageMetadata> | undefined;

const readPackageMetadata = async (): Promise<PackageMetadata> => {
  if (packageMetadataPromise === undefined) {
    packageMetadataPromise = readFile(packageJsonUrl, "utf8").then((text) => {
      return JSON.parse(text) as PackageMetadata;
    });
  }

  return packageMetadataPromise;
};

export const readPackageVersion = async (): Promise<string> => {
  const { version } = await readPackageMetadata();

  if (typeof version === "string" && version.trim() !== "") {
    return version;
  }

  return "0.0.0";
};
