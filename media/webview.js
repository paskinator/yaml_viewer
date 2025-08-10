(function () {
  try {
    const vscode = acquireVsCodeApi();

    console.log("webview.js started");
    console.log("tableData received:", tableData);

    // Extract all unique keys from data for columns
    const allKeys = Array.from(new Set(tableData.flatMap(row => Object.keys(row))));
    console.log("Columns detected:", allKeys);

    // Prepare display data, stringify nested objects/lists
    const displayData = tableData.map(row => {
      const newRow = {};
      allKeys.forEach(key => {
        const val = row[key];
        if (val !== null && typeof val === "object") {
          try {
            newRow[key] = JSON.stringify(val);
          } catch {
            newRow[key] = String(val);
          }
        } else if (val === undefined) {
          newRow[key] = "";
        } else {
          newRow[key] = val;
        }
      });
      return newRow;
    });

    if (allKeys.length === 0) {
      document.getElementById("table").innerHTML = "<p>No data found.</p>";
      document.getElementById("saveBtn").disabled = true;
      console.log("No columns found — empty data");
      return;
    }

    const columns = allKeys.map(key => ({
      title: key,
      field: key,
      headerFilter: "input",
      headerFilterPlaceholder: "Filter...",
      editor: "input"
    }));

    const table = new Tabulator("#table", {
      data: displayData,
      layout: "fitColumns",
      columns: columns,
      reactiveData: true,
      height: "100%",
    });

    function setStatus(msg) {
      document.getElementById("status").textContent = msg;
      console.log("Status:", msg);
    }

    document.getElementById("addRowBtn").addEventListener("click", () => {
      const blankRow = {};
      allKeys.forEach(key => (blankRow[key] = ""));
      table.addRow(blankRow);
      setStatus("Added new row");
    });

    document.getElementById("saveBtn").addEventListener("click", () => {
      try {
        const updatedDisplay = table.getData();
        console.log("Saving data from table:", updatedDisplay);

        // Parse JSON strings back into objects/arrays if possible
        const restored = updatedDisplay.map(row => {
          const newRow = {};
          Object.entries(row).forEach(([key, val]) => {
            if (typeof val === "string") {
              const trimmed = val.trim();
              if (
                (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                (trimmed.startsWith("[") && trimmed.endsWith("]"))
              ) {
                try {
                  newRow[key] = JSON.parse(trimmed);
                  return;
                } catch {}
              }
            }
            newRow[key] = val;
          });
          return newRow;
        });

        vscode.postMessage({ type: "saveData", data: restored });
        setStatus("Saving...");
      } catch (err) {
        setStatus("Error preparing save: " + err.message);
        console.error("Save preparation error:", err);
      }
    });

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "saved") {
        if (msg.success) {
          setStatus("Saved.");
          setTimeout(() => setStatus(""), 2000);
        } else {
          setStatus("Save failed: " + (msg.error || "unknown"));
          console.error("Save failed:", msg.error);
        }
      }
    });
  } catch (e) {
    document.body.innerHTML = "<pre style='color:red'>Error: " + e.message + "</pre>";
    console.error(e);
  }
})();
