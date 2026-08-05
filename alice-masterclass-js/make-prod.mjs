import { writeFileSync } from 'fs';

const targetPath = './src/environments/environment.prod.ts';
const apiUrl = process.env.API_URL;

// Without API_URL the old template wrote the literal string "undefined" into a
// tracked file. Fail instead so a local `npm run build:prod` cannot corrupt it.
if (!apiUrl) {
  console.error(
    'make-prod.mjs: API_URL is missing.\n' +
      'CI sets it automatically. Locally either:\n' +
      '  API_URL=https://…/api/v1/ npm run build:prod\n' +
      'or use `npm start` / `npm run start:demo` (they do not regenerate this file).'
  );
  process.exit(1);
}

const envConfigFile = `export const AppConfig = {
  production: true,
  environment: 'PROD',
  apiUrl: '${apiUrl}',
  demoMode: false,
  version: '${process.env.VERSION ?? "0.0.0"}'
};
`;

try {
  writeFileSync(targetPath, envConfigFile);
  console.log(`Angular environment.prod.ts generated correctly at ${targetPath}\n`);
} catch (err) {
  console.error(err);
  process.exit(1);
}