const vscode = require("vscode");
const yaml = require("js-yaml");
const path = require("path");

function activate(context) {
  console.log("YAML Table Viewer extension activated");

  let disposable = vscode.commands.registerCommand(
    "yamlTableViewer.openPreview",
    async () => {
      console.log("Command 'openPreview' triggered");

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("Open a YAML file first.");
        console.log("No active editor found");
        return;
      }

      const doc = editor.document;
      const fileUri = doc.uri;
      const filePath = fileUri.fsPath;

      let fileContent;
      try {
        fileContent = doc.getText();
        console.log("File content loaded");
      } catch (err) {
        vscode.window.showErrorMessage("Unable to read file: " + err.message);
        console.error("Read file error:", err);
        return;
      }

      let data;
      try {
        data = yaml.load(fileContent) || {};
        console.log("YAML parsed successfully:", data);
      } catch (err) {
        vscode.window.showErrorMessage("Invalid YAML: " + err.message);
        console.error("YAML parse error:", err);
        return;
      }

      const tableArray = Array.isArray(data.tables) ? data.tables : [];
      console.log("Extracted 'tables' array:", tableArray);

      const panel = vscode.window.createWebviewPanel(
        "yamlTablePreview",
        `YAML Table Preview — ${path.basename(filePath)}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media"))],
        }
      );

      const webviewUri = (filename) =>
        panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", filename)));

      panel.webview.html = getWebviewContent(JSON.stringify(tableArray), webviewUri);

      panel.webview.onDidReceiveMessage(
        async (message) => {
          console.log("Message received from webview:", message);

          if (message.type === "saveData") {
            try {
              const updatedTables = Array.isArray(message.data) ? message.data : [];

              const latestDoc = await vscode.workspace.openTextDocument(fileUri);
              let latestObj;
              try {
                latestObj = yaml.load(latestDoc.getText()) || {};
              } catch {
                latestObj = {};
              }

              latestObj.tables = updatedTables;

              const newYaml = yaml.dump(latestObj, { lineWidth: -1 });
              console.log("Serialized updated YAML:\n", newYaml);

              const encoder = new TextEncoder();
              await vscode.workspace.fs.writeFile(fileUri, encoder.encode(newYaml));
              console.log("File saved successfully");

              vscode.window.showInformationMessage("YAML saved from table preview.");

              const updatedDoc = await vscode.workspace.openTextDocument(fileUri);
              await vscode.window.showTextDocument(updatedDoc, { preserveFocus: true, preview: false });

              panel.webview.postMessage({ type: "saved", success: true });
            } catch (err) {
              vscode.window.showErrorMessage("Failed to save YAML: " + err.message);
              console.error("Save error:", err);
              panel.webview.postMessage({ type: "saved", success: false, error: err.message });
            }
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
  console.log("YAML Table Viewer extension deactivated");
}
exports.deactivate = deactivate;

function getWebviewContent(tableJson, webviewUri) {
  const tabulatorJs = "https://unpkg.com/tabulator-tables@5.4.4/dist/js/tabulator.min.js";
  const tabulatorCss = "https://unpkg.com/tabulator-tables@5.4.4/dist/css/tabulator.min.css";
  const webviewCss = webviewUri("webview.css");
  const webviewJs = webviewUri("webview.js");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'unsafe-inline' ${tabulatorJs} https:;
    style-src 'unsafe-inline' ${tabulatorCss} ${webviewCss} https:;
    img-src https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${tabulatorCss}" rel="stylesheet" />
  <link href="${webviewCss}" rel="stylesheet" />
  <title>YAML Table Preview</title>
</head>
<body>
  <div id="toolbar">
    <button id="addRowBtn">➕ Add Row</button>
    <button id="saveBtn">💾 Save</button>
    <span id="status" aria-live="polite"></span>
  </div>
  <div id="table"></div>

  <script>
  const tableData = ${tableJson};
  </script>

  <script src="${tabulatorJs}"></script>
  <script src="${webviewJs}"></script>
</body>
</html>`;
}
