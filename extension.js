const vscode = require("vscode");
const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");

/**
 * Activate extension
 */
function activate(context) {
  let disposable = vscode.commands.registerCommand(
    "yamlTableViewer.openPreview",
    async function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("Open a YAML file first.");
        return;
      }

      const doc = editor.document;
      const fileUri = doc.uri;
      const filePath = fileUri.fsPath;

      let fileContent;
      try {
        fileContent = doc.getText();
      } catch (err) {
        vscode.window.showErrorMessage("Unable to read file: " + err.message);
        return;
      }

      let data;
      try {
        data = yaml.load(fileContent) || {};
      } catch (err) {
        vscode.window.showErrorMessage("Invalid YAML: " + err.message);
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "yamlTablePreview",
        `YAML Table Preview — ${path.basename(filePath)}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media"))]
        }
      );

      const webviewUri = (filename) =>
        panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", filename)));

      // prepare table data (we expect `tables` to be an array)
      const tableData = Array.isArray(data.tables) ? data.tables : [];

      panel.webview.html = getWebviewContent(JSON.stringify(tableData), webviewUri);

      // Listen for messages FROM the webview.
      panel.webview.onDidReceiveMessage(
        async (message) => {
          if (message.type === "saveData") {
            try {
              // message.data should be an array of objects
              const updatedTables = Array.isArray(message.data) ? message.data : [];

              // construct YAML root (preserve other keys if there were any)
              // We read the latest doc content to attempt to preserve anything else the file contains
              const latestText = (await vscode.workspace.openTextDocument(fileUri)).getText();
              let latestObj;
              try {
                latestObj = yaml.load(latestText) || {};
              } catch (err) {
                // if latest is invalid, fallback to empty object
                latestObj = {};
              }

              latestObj.tables = updatedTables;

              const newYaml = yaml.dump(latestObj, { lineWidth: -1 });

              // write using vscode.workspace.fs to ensure proper permissions & cross-platform behavior
              const encoder = new TextEncoder();
              await vscode.workspace.fs.writeFile(fileUri, encoder.encode(newYaml));

              // show confirmation and reload the editor
              vscode.window.showInformationMessage("YAML saved from table preview.");
              // reopen document to reflect changes
              const updatedDoc = await vscode.workspace.openTextDocument(fileUri);
              await vscode.window.showTextDocument(updatedDoc, { preserveFocus: true, preview: false });
              
              // notify webview
              panel.webview.postMessage({ type: "saved", success: true });
            } catch (err) {
              vscode.window.showErrorMessage("Failed to save YAML: " + err.message);
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

function deactivate() {}
exports.deactivate = deactivate;

/**
 * Returns HTML for the webview.
 * tableJson is a JSON string of an array of row objects.
 */
function getWebviewContent(tableJson, webviewUri) {
  // Tabulator CDN (used for the table UI)
  const tabulatorJs = "https://unpkg.com/tabulator-tables@5.4.4/dist/js/tabulator.min.js";
  const tabulatorCss = "https://unpkg.com/tabulator-tables@5.4.4/dist/css/tabulator.min.css";
  const webviewCss = webviewUri("webview.css");
  const webviewJs = webviewUri("webview.js");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${tabulatorJs} https:; style-src 'unsafe-inline' ${tabulatorCss} ${webviewCss} https:; img-src https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${tabulatorCss}" rel="stylesheet" />
  <link href="${webviewCss}" rel="stylesheet" />
  <title>YAML Table Preview</title>
</head>
<body>
  <div id="toolbar">
    <button id="saveBtn">💾 Save to YAML</button>
    <span id="status" aria-live="polite"></span>
  </div>

  <div id="table"></div>

  <script>
    // tableData made available to webview script
    const tableData = ${tableJson};
    const vscode = acquireVsCodeApi();
  </script>

  <script src="${tabulatorJs}"></script>
  <script src="${webviewJs}"></script>
</body>
</html>`;
}
