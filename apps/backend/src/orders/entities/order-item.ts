export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    unit: string;
  };
  qty: number;
  price: number;
  lineTotal: number;
  createdAt: string;
  updatedAt: string;
};
