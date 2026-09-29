import { createShipmentAction } from "@/actions/reference-data";
import { ActionForm, Field, SelectField } from "@/components/features/action-form";
import { listOrders, listShipments } from "@/server/reference-data";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "in_transit", "delivered", "delayed", "lost", "returned"];

export default async function ShipmentsPage() {
  const [shipments, orders] = await Promise.all([listShipments(), listOrders()]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Shipments</h1>
      <ActionForm action={createShipmentAction} submitLabel="Add shipment">
        <SelectField
          name="linkedOrderId"
          label="Order"
          required
          options={orders.map((o) => ({ value: o.id, label: `${o.customerName} - ${o.productName}` }))}
        />
        <Field name="carrier" label="Carrier" required />
        <Field name="trackingNumber" label="Tracking number" required />
        <Field name="warehouse" label="Warehouse" />
        <Field name="shipDate" label="Ship date" type="date" />
        <Field name="deliveryDate" label="Delivery date" type="date" />
        <SelectField
          name="deliveryStatus"
          label="Delivery status"
          required
          options={STATUSES.map((s) => ({ value: s, label: s }))}
        />
      </ActionForm>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Order</th>
            <th>Carrier</th>
            <th>Tracking</th>
            <th>Warehouse</th>
            <th>Ship date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="py-1">{s.order.customerName}</td>
              <td>{s.carrier}</td>
              <td>{s.trackingNumber}</td>
              <td>{s.warehouse ?? "-"}</td>
              <td>{s.shipDate ? s.shipDate.toISOString().slice(0, 10) : "-"}</td>
              <td>{s.deliveryStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
