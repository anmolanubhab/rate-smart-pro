const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
  const ci = COLS.indexOf(col);
  if (e.key === "Enter") {
    e.preventDefault();
    if (ci < COLS.length - 1) {
      // अगले कॉलम पर जाओ (Qty -> MRP -> Disc)
      focusCell(idx, COLS[ci + 1]);
    } else {
      // अगर आखिरी कॉलम (Disc) पर हैं
      if (idx === items.length - 1) {
        addRow(); // नया रो जोड़ो
        // डिले को 30ms से बढ़ाकर 100ms किया ताकि React DOM जनरेट कर ले
        setTimeout(() => focusCell(idx + 1, "part"), 100);
      } else {
        // अगर पहले से नीचे रो मौजूद है, तो सीधे उसके पार्ट नंबर पर जाओ
        focusCell(idx + 1, "part");
      }
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    focusCell(Math.min(items.length - 1, idx + 1), col);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (idx === 0) return;
    focusCell(Math.max(0, idx - 1), col);
  }
};
