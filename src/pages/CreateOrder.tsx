import React, { useState, useRef, useEffect } from 'react';

type Col = 'part' | 'qty' | 'mrp' | 'disc';

type Item = {
  part: string;
  qty: number;
  mrp: number;
  disc: number;
};

const CreateOrder = () => {
  const [items, setItems] = useState<Item[]>([
    { part: '', qty: 1, mrp: 0, disc: 0 }
  ]);

  const COLS: Col[] = ['part', 'qty', 'mrp', 'disc'];
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const focusCell = (rowIdx: number, col: Col) => {
    const key = `${rowIdx}-${col}`;
    const element = inputRefs.current[key];
    if (element) {
      element.focus();
      element.select();
    }
  };

  const addRow = () => {
    setItems(prev => [...prev, { part: '', qty: 1, mrp: 0, disc: 0 }]);
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    const ci = COLS.indexOf(col);
    
    if (e.key === "Enter") {
      e.preventDefault();
      if (ci < COLS.length - 1) {
        focusCell(idx, COLS[ci + 1]);
      } else {
        if (idx === items.length - 1) {
          addRow();
          setTimeout(() => focusCell(idx + 1, "part"), 100);
        } else {
          focusCell(idx + 1, "part");
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (idx < items.length - 1) {
        focusCell(idx + 1, col);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx > 0) {
        focusCell(idx - 1, col);
      }
    }
  };

  const handleChange = (idx: number, col: Col, value: string | number) => {
    const newItems = [...items];
    if (col === 'part') {
      newItems[idx].part = value as string;
    } else if (col === 'qty') {
      newItems[idx].qty = Number(value) || 0;
    } else if (col === 'mrp') {
      newItems[idx].mrp = Number(value) || 0;
    } else if (col === 'disc') {
      newItems[idx].disc = Number(value) || 0;
    }
    setItems(newItems);
  };

  const calculateTotal = (item: Item) => {
    const subtotal = item.qty * item.mrp;
    const discountAmount = (subtotal * item.disc) / 100;
    return subtotal - discountAmount;
  };

  const calculateGrandTotal = () => {
    return items.reduce((total, item) => total + calculateTotal(item), 0);
  };

  const renderInput = (item: Item, idx: number, col: Col) => {
    const value = item[col];
    const key = `${idx}-${col}`;

    if (col === 'part') {
      return (
        <input
          ref={el => inputRefs.current[key] = el}
          type="text"
          value={value as string}
          onChange={(e) => handleChange(idx, col, e.target.value)}
          onKeyDown={(e) => handleKey(e, idx, col)}
          className="border p-2 rounded w-full"
          placeholder="Part Number"
        />
      );
    } else {
      return (
        <input
          ref={el => inputRefs.current[key] = el}
          type="number"
          value={value as number}
          onChange={(e) => handleChange(idx, col, e.target.value)}
          onKeyDown={(e) => handleKey(e, idx, col)}
          className="border p-2 rounded w-full text-right"
          step={col === 'disc' ? 0.01 : 1}
          min={0}
        />
      );
    }
  };

  useEffect(() => {
    setTimeout(() => focusCell(0, 'part'), 100);
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Create Order</h1>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left">Part Number</th>
              <th className="border p-2 text-right">Quantity</th>
              <th className="border p-2 text-right">MRP (₹)</th>
              <th className="border p-2 text-right">Discount (%)</th>
              <th className="border p-2 text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td className="border p-2">{renderInput(item, idx, 'part')}</td>
                <td className="border p-2">{renderInput(item, idx, 'qty')}</td>
                <td className="border p-2">{renderInput(item, idx, 'mrp')}</td>
                <td className="border p-2">{renderInput(item, idx, 'disc')}</td>
                <td className="border p-2 text-right font-semibold">
                  ₹{calculateTotal(item).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={4} className="border p-2 text-right font-bold">
                Grand Total:
              </td>
              <td className="border p-2 text-right font-bold text-lg">
                ₹{calculateGrandTotal().toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => {
            addRow();
            setTimeout(() => focusCell(items.length, 'part'), 100);
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          + Add New Row
        </button>
      </div>
    </div>
  );
};

export default CreateOrder;
