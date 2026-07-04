import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.claudetracker.widget',
  productName: 'Claude Tracker',
  directories: { output: 'dist', buildResources: 'resources' },
  files: ['out/**/*'],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Claude Tracker',
  },
}
export default config
