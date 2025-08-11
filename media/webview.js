(function () {
  try {
    const vscode = acquireVsCodeApi();

    console.log("webview.js started");
    console.log("tableData received:", tableData);

    // Extract all unique keys from data for columns
    const allKeys = Array.from(new Set(tableData.flatMap(row => Object.keys(row))));
    console.log("Columns detected:", allKeys);

    const yaml = window.jsyaml;
  
    // Prepare display data, stringify nested objects/lists
    const displayData = tableData.map(row => {
      const newRow = {};
      allKeys.forEach(key => {
        const val = row[key];
        if (val !== null && typeof val === "object") {
          try {
            // Dump object/array to YAML with block style
            const dumped = yaml.dump(val, { flowLevel: 0 }).trim();
            // Store as plain string for editing in table
            newRow[key] = dumped;
          } catch {
            newRow[key] = String(val);
          }
        } else if (val === undefined || val === null) {
          newRow[key] = "";
        } else {
          newRow[key] = String(val); // ensure primitive types are strings
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

        const restored = updatedDisplay.map(row => {
          const newRow = {};
          Object.entries(row).forEach(([key, val]) => {
            if (typeof val === "string") {
              const trimmed = val.trim();

              // If value looks like YAML (multi-line or starts with [ or {), parse it
              if (trimmed.includes("\n") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
                try {
                  newRow[key] = yaml.load(trimmed); // parse YAML string into object/array
                  return;
                } catch {
                  newRow[key] = val;
                  return;
                }
              }

              // If numeric string, convert to number
              if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
                newRow[key] = Number(trimmed);
                return;
              }

              // Skip completely empty strings
              if (trimmed === "") return;

              // Otherwise keep as raw string
              newRow[key] = val;

            } else if (val === "" || val === null || val === undefined) {
              return; // skip empty/null/undefined

            } else {
              // Keep other types (numbers, booleans) as is
              newRow[key] = val;
            }
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
