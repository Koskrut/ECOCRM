// Production/Docker: plain Node config so prisma migrate deploy can load without ts-node.
// DATABASE_URL must be set in the environment (e.g. by docker-compose).
module.exports = {
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
