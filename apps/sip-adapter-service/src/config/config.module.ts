import { Global, Module } from "@nestjs/common";
import { loadConfiguration, type AppConfig } from "./configuration";

export const CONFIG = Symbol("CONFIG");

@Global()
@Module({
  providers: [
    {
      provide: CONFIG,
      useFactory: (): AppConfig => loadConfiguration(),
    },
  ],
  exports: [CONFIG],
})
export class ConfigModule {}
