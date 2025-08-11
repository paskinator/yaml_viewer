const vscode = require("vscode");
const path = require("path");
const yaml = require("js-yaml");

function activate(context) {
  console.log("YAML Table Viewer activated");

  const disposable = vscode.commands.registerCommand(
    "yamlTableViewer.openPreview",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("Open a YAML file first.");
        return;
      }

      const doc = editor.document;
      const fileUri = doc.uri;
      const filePath = fileUri.fsPath;

      // Parse YAML file (load entire document)
      let rootObj;
      try {
        rootObj = yaml.load(doc.getText()) || {};
      } catch (err) {
        vscode.window.showErrorMessage("Invalid YAML: " + err.message);
        return;
      }

      // Determine the table array we want to show:
      // - If document root is an array, treat that as table array
      // - else if root.tables is array, use that
      // - otherwise use empty array
      const tableArray = Array.isArray(rootObj)
        ? rootObj
        : Array.isArray(rootObj.tables)
        ? rootObj.tables
        : [];

      // Prepare the data we will send to the webview:
      // For any nested object/array, dump it into a YAML string (block style),
      // so the webview receives a string for every cell (prevents [object Object]).
      const displayData = tableArray.map((row) => {
        const newRow = {};
        Object.keys(row).forEach((key) => {
          const val = row[key];
          if (val === null || val === undefined) {
            newRow[key] = "";
          } else if (typeof val === "object") {
            try {
              // Dump nested object/array to YAML block string (not JSON)
              newRow[key] = yaml.dump(val, { flowLevel: -1 }).trim();
            } catch {
              newRow[key] = String(val);
            }
          } else {
            newRow[key] = String(val);
          }
        });
        return newRow;
      });

      // Create webview
      const panel = vscode.window.createWebviewPanel(
        "yamlTablePreview",
        `YAML Table Preview — ${path.basename(filePath)}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      // Safe-escape JSON to inject
      const tableJson = JSON.stringify(displayData).replace(/</g, "\\u003c");

      panel.webview.html = getWebviewHtml(panel.webview, tableJson);

      // Handle messages from webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          try {
            if (message.type === "saveData") {
              const incoming = Array.isArray(message.data) ? message.data : [];

              // Reconstruct data: parse YAML strings back to objects where appropriate,
              // convert numeric-looking strings to numbers, keep other strings as strings.
              const restored = incoming.map((row) => {
                const newRow = {};
                for (const [key, rawVal] of Object.entries(row)) {
                  // rawVal comes from webview; it's a string for all cells
                  if (typeof rawVal === "string") {
                    const trimmed = rawVal.trim();

                    if (trimmed === "") {
                      // skip empty cells -> don't include this key
                      continue;
                    }

                    // If it looks like YAML (multi-line or starts with '[' '{' '-' or '|' '>')
                    // try parsing it as YAML to restore objects/arrays
                    if (
                      trimmed.includes("\n") ||
                      trimmed.startsWith("[") ||
                      trimmed.startsWith("{") ||
                      trimmed.startsWith("- ") ||
                      trimmed.startsWith("|") ||
                      trimmed.startsWith(">")
                    ) {
                      try {
                        newRow[key] = yaml.load(trimmed);
                        continue;
                      } catch (e) {
                        // parse failed -> keep as string
                        newRow[key] = trimmed;
                        continue;
                      }
                    }

                    // boolean
                    if (trimmed === "true" || trimmed === "false") {
                      newRow[key] = trimmed === "true";
                      continue;
                    }

                    // numeric
                    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
                      newRow[key] = Number(trimmed);
                      continue;
                    }

                    // fallback: keep as string
                    newRow[key] = trimmed;
                  } else if (rawVal === null || rawVal === undefined) {
                    // skip
                    continue;
                  } else {
                    // if it's already a primitive (rare here), keep it
                    newRow[key] = rawVal;
                  }
                }
                return newRow;
              });

              // Load the latest doc text to preserve other top-level keys
              const latestDoc = await vscode.workspace.openTextDocument(fileUri);
              let latestRoot;
              try {
                latestRoot = yaml.load(latestDoc.getText()) || {};
              } catch {
                latestRoot = {};
              }

              // Place restored array back into the document:
              let finalObj;
              if (Array.isArray(latestRoot)) {
                // if the root was an array, replace it
                finalObj = restored;
              } else {
                // otherwise replace or set `tables` property
                latestRoot.tables = restored;
                finalObj = latestRoot;
              }

              // Dump YAML with block style for collections
              const outYaml = yaml.dump(finalObj, {
                flowLevel: -1, // block style
                lineWidth: -1, // no automatic line wrap
                noCompatMode: true,
              });

              const encoder = new TextEncoder();
              await vscode.workspace.fs.writeFile(fileUri, encoder.encode(outYaml));

              panel.webview.postMessage({ type: "saved", success: true });
              vscode.window.showInformationMessage("Saved YAML from table preview.");
            }
          } catch (err) {
            console.error("Error handling message from webview:", err);
            panel.webview.postMessage({ type: "saved", success: false, error: String(err) });
            vscode.window.showErrorMessage("Failed to save YAML: " + String(err));
          }
        },
        undefined,
        context.subscriptions
      );
    }
  );

  context.subscriptions.push(disposable);
}
exports.activate = activate;

function deactivate() {
  // cleanup if needed
}
exports.deactivate = deactivate;

/**
 * Returns the webview HTML. We inline the webview UI for simplicity.
 * tableJson is a JSON string (already escaped)
 */
function getWebviewHtml(webview, tableJson) {
  // Use Tabulator from CDN. We display returned cell values as strings.
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src https: 'unsafe-inline'; style-src https: 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://unpkg.com/tabulator-tables@5.4.4/dist/css/tabulator.min.css" rel="stylesheet">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial; padding: 8px; box-sizing: border-box; height: 100vh; display: flex; flex-direction: column; }
    #toolbar { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
    button { padding:6px 10px; border-radius:6px; border:1px solid rgba(0,0,0,0.12); background:#f3f3f3; cursor:pointer;}
    #status { margin-left:auto; font-size:0.9rem; color:#333; }
    #table { flex:1 1 auto; }
    .tabulator-cell textarea { width:100%; height:100%; box-sizing:border-box; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="addRowBtn">➕ Add Row</button>
    <button id="saveBtn">💾 Save</button>
    <div id="status" aria-live="polite"></div>
  </div>

  <div id="table"></div>

  <script src="https://unpkg.com/tabulator-tables@5.4.4/dist/js/tabulator.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js"></script>
  <script>
    // tableData provided by extension
    const tableData = ${tableJson};

    // Build column list
    const allKeys = Array.from(new Set(tableData.flatMap(row => Object.keys(row))));
    // Ensure every cell is string: Tabulator will show multiline YAML strings nicely.
    const displayData = tableData.map(row => {
      const nr = {};
      allKeys.forEach(k => {
        const v = row[k];
        if (v === null || v === undefined) {
          nr[k] = "";
        } else {
          nr[k] = String(v);
        }
      });
      return nr;
    });

    // Create columns: use textarea editor for multiline convenience
    const columns = allKeys.map(key => ({
      title: key,
      field: key,
      headerFilter: "input",
      headerFilterPlaceholder: "Filter...",
      editor: "textarea", // allows multi-line YAML editing
      formatter: function(cell, formatterParams, onRendered){
        // show value as-is (it's a string)
        return cell.getValue();
      }
    }));

    const table = new Tabulator("#table", {
      data: displayData,
      layout: "fitColumns",
      columns: columns,
      height: "100%",
      reactiveData: true,
      placeholder: "No data"
    });

    const vscode = acquireVsCodeApi();

    function setStatus(msg){
      document.getElementById("status").textContent = msg || "";
      console.log("STATUS:", msg);
    }

    document.getElementById("addRowBtn").addEventListener("click", () => {
      const blank = {};
      allKeys.forEach(k => blank[k] = "");
      table.addRow(blank);
      setStatus("Added row");
    });

    document.getElementById("saveBtn").addEventListener("click", () => {
      try {
        const data = table.getData(); // array of objects (strings)
        console.log("Sending save data to extension:", data);
        vscode.postMessage({ type: "saveData", data });
        setStatus("Saving...");
      } catch (err) {
        console.error("Prepare save error:", err);
        setStatus("Save prep error: " + String(err));
      }
    });

    // listen for save reply
    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "saved") {
        if (msg.success) {
          setStatus("Saved");
          setTimeout(() => setStatus(""), 2000);
        } else {
          setStatus("Save failed: " + (msg.error || "unknown"));
        }
      }
    });

    console.log("webview ready, displayData:", displayData);
  </script>
</body>
</html>`;
}
