import React from "react";

const InvoicePrint = ({ order }) => {
  return (
    <div className="invoice-print">
      
      {/* Header */}
      <div className="header">
        <div>
          <h1>RD Calculator Pro</h1>
          <p>Spare Parts Management</p>
        </div>

        <div>
          <h2>TAX INVOICE</h2>
        </div>
      </div>

      {/* Customer Info */}
      <div className="customer-section">
        <p><strong>Party:</strong> {order.party_name}</p>
        <p><strong>Mobile:</strong> {order.mobile}</p>
      </div>

      {/* Table */}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Part No</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
          {order.items.map((item, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{item.part_number}</td>
              <td>{item.name}</td>
              <td>{item.qty}</td>
              <td>{item.rate}</td>
              <td>{item.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div className="totals">
        <h2>Grand Total: ₹ {order.total}</h2>
      </div>

    </div>
  );
};

export default InvoicePrint;
