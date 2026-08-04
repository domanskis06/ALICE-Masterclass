import { writeFile } from 'fs';

const targetPath = './src/environments/environment.demo.ts';

const envConfigFile = `export const AppConfig = {
  production: true,
  environment: 'DEMO',
  apiUrl: '',
  /** Offline public demo: no Django, local persistence, shared VA histograms. */
  demoMode: true,
  version: '${process.env.VERSION ?? "0.0.0"}'
};
`;

writeFile(targetPath, envConfigFile, function (err) {
  if (err) {
    throw console.error(err);
  } else {
    console.log(`Angular environment.demo.ts generated correctly at ${targetPath}\n`);
  }
});
