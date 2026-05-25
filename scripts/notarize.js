import { notarize } from 'electron-notarize';

const _default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  console.log('🔐 Notarizing macOS app...');

  return await notarize({
    appBundleId: 'com.CybrxAgent.agent',
    appPath: `${appOutDir}/CybrxAgent.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  });
};
export { _default as default };
