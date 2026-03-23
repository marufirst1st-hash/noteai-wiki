module.exports = {
  apps: [
    {
      name: 'noteai-wiki',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
