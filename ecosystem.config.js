module.exports = {
  apps: [
    {
      name: "mediquo_system",
      script: "src/server.js",
      instances: "3",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
