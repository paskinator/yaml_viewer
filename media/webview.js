// webview script runs inside VS Code webview
(function () {
  // Build columns from the first row keys (fallback to empty)
  const first = tableData[0] || {};
  const columns = Object.keys(first).map((key) => ({
    title: key,
    field: key,
    headerFilter: "input",
    headerFilterPlaceholder: "Filter...",
    editor: "input",
  }));

  // If there are no columns (empty tableData), show a helpful message
  if (columns.length === 0) {
    document.getElementById("table").innerHTML = "<p>No tabular data found in 'tables'.</p>";
    document.getElementById("saveBtn").disabled = true;
    return;
  }

  const table = new Tabulator("#table", {
    data: tableData,
    layout: "fitColumns",
    columns: columns,
    reactiveData: true, // allows direct mutation of tableData if needed
    height: "100%"
  });

  const saveBtn = document.getElementById("saveBtn");
  const statusEl = document.getElementById("status");

  saveBtn.addEventListener("click", () => {
    try {
      const updated = table.getData();
      // send to extension to save
      vscode.postMessage({ type: "saveData", data: updated });
      statusEl.textContent = "Saving...";
    } catch (err) {
      statusEl.textContent = "Error preparing save: " + err.message;
    }
  });

  // listen for messages FROM extension (e.g., save result)
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "saved") {
      if (msg.success) {
        statusEl.textContent = "Saved successfully.";
        setTimeout(() => (statusEl.textContent = ""), 2500);
      } else {
        statusEl.textContent = "Save failed: " + (msg.error || "unknown");
      }
    }
  });
})();
