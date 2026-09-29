import { createOrderAction } from "@/actions/reference-data";
import { ActionForm, Field } from "@/components/features/action-form";
import { listOrders } from "@/server/reference-data";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await listOrders();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Orders</h1>
      <ActionForm action={createOrderAction} submitLabel="Add order">
        <Field name="orderDate" label="Order date" type="date" required />
        <Field name="salesChannel" label="Sales channel" required />
        <Field name="customerName" label="Customer name" required />
        <Field name="customerEmail" label="Customer email" type="email" />
        <Field name="customerPhone" label="Customer phone" />
        <Field name="sku" label="SKU" required />
        <Field name="productName" label="Product name" required />
        <Field name="quantity" label="Quantity" type="number" required />
        <Field name="orderValue" label="Order value" type="number" required />
        <Field name="supplier" label="Supplier" />
      </ActionForm>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Date</th>
            <th>Customer</th>
            <th>SKU</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Value</th>
            <th>Supplier</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-border">
              <td className="py-1">{o.orderDate.toISOString().slice(0, 10)}</td>
              <td>{o.customerName}</td>
              <td>{o.sku}</td>
              <td>{o.productName}</td>
              <td>{o.quantity}</td>
              <td>{o.orderValue.toString()}</td>
              <td>{o.supplier ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
