import { readFileSync } from "node:fs";

export const shouldReadFromStdin = (options: {
  force: boolean;
  hasPositionalInput: boolean;
}) => {
  return options.force || (!options.hasPositionalInput && !process.stdin.isTTY);
};

export const readStdinText = async () => {
  return readFileSync(process.stdin.fd, "utf8");
};
