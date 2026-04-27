import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";

export type OrderSheetExportOptions = {
  exportDate: Date;
};

export type OrderPaymentsReaderPort = {
  listByOrderId(orderId: string, actor?: AuthUser): Promise<unknown>;
};

export type OrderSheetExporterPort = {
  sendOrderToSheet(orderId: string, options: OrderSheetExportOptions): Promise<unknown>;
};

export type OrderFinancePort = {
  recalcOrder(orderId: string): Promise<void>;
};

export type StoreBankAccountPort = {
  resolveStoreDefaultBankAccountIdForCheckout(): Promise<string | null>;
};

export type StoreNpDirectoryCityQuery = {
  q: string;
  limit?: number;
};

export type StoreNpDirectoryWarehouseQuery = {
  cityRef: string;
  q: string;
  limit?: number;
  type?: "WAREHOUSE" | "POSTOMAT";
};

export type StoreNpDirectoryStreetQuery = {
  cityRef: string;
  q: string;
  limit?: number;
  browse?: boolean;
};

export type StoreNpDirectoryPort = {
  searchCities(query: StoreNpDirectoryCityQuery): Promise<unknown>;
  searchWarehouses(query: StoreNpDirectoryWarehouseQuery): Promise<unknown>;
  searchStreets(query: StoreNpDirectoryStreetQuery): Promise<unknown>;
};

export type MessengerPort = {
  sendMessageToChat(chatId: string, text: string): Promise<unknown>;
};

@Injectable()
export class IntegrationPortsService {
  private orderPaymentsReader: OrderPaymentsReaderPort | null = null;
  private orderSheetExporter: OrderSheetExporterPort | null = null;
  private orderFinance: OrderFinancePort | null = null;
  private storeBankAccount: StoreBankAccountPort | null = null;
  private storeNpDirectory: StoreNpDirectoryPort | null = null;
  private messenger: MessengerPort | null = null;

  registerOrderPaymentsReader(port: OrderPaymentsReaderPort): void {
    this.orderPaymentsReader = port;
  }

  registerOrderSheetExporter(port: OrderSheetExporterPort): void {
    this.orderSheetExporter = port;
  }

  registerOrderFinance(port: OrderFinancePort): void {
    this.orderFinance = port;
  }

  registerStoreBankAccount(port: StoreBankAccountPort): void {
    this.storeBankAccount = port;
  }

  registerStoreNpDirectory(port: StoreNpDirectoryPort): void {
    this.storeNpDirectory = port;
  }

  registerMessenger(port: MessengerPort): void {
    this.messenger = port;
  }

  listOrderPaymentsByOrderId(orderId: string, actor?: AuthUser): Promise<unknown> {
    if (!this.orderPaymentsReader) throw new NotFoundException();
    return this.orderPaymentsReader.listByOrderId(orderId, actor);
  }

  sendOrderToSheet(orderId: string, options: OrderSheetExportOptions): Promise<unknown> {
    if (!this.orderSheetExporter) {
      throw new ServiceUnavailableException("Google Sheet integration is not available");
    }
    return this.orderSheetExporter.sendOrderToSheet(orderId, options);
  }

  async recalcOrderFinance(orderId: string): Promise<void> {
    await this.orderFinance?.recalcOrder(orderId);
  }

  resolveStoreDefaultBankAccountIdForCheckout(): Promise<string | null> {
    return this.storeBankAccount?.resolveStoreDefaultBankAccountIdForCheckout() ?? Promise.resolve(null);
  }

  searchNpCities(query: StoreNpDirectoryCityQuery): Promise<unknown> {
    if (!this.storeNpDirectory) throw new NotFoundException();
    return this.storeNpDirectory.searchCities(query);
  }

  searchNpWarehouses(query: StoreNpDirectoryWarehouseQuery): Promise<unknown> {
    if (!this.storeNpDirectory) throw new NotFoundException();
    return this.storeNpDirectory.searchWarehouses(query);
  }

  searchNpStreets(query: StoreNpDirectoryStreetQuery): Promise<unknown> {
    if (!this.storeNpDirectory) throw new NotFoundException();
    return this.storeNpDirectory.searchStreets(query);
  }

  sendMessageToChat(chatId: string, text: string): Promise<unknown> {
    if (!this.messenger) throw new ServiceUnavailableException("Messenger integration is not available");
    return this.messenger.sendMessageToChat(chatId, text);
  }
}
