const vscode = require("vscode");
const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");

function activate(context) {
  let disposable = vscode.commands.registerCommand(
    "yamlTableViewer.openPreview",
    function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const fileContent = fs.readFileSync(filePath, "utf8");
      let data;

      try {
        data = yaml.load(fileContent);
      } catch (err) {
        vscode.window.showErrorMessage("Invalid YAML: " + err.message);
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "yamlTablePreview",
        "YAML Table Preview",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media"))]
        }
      );

      const webviewUri = (filename) =>
        panel.webview.asWebviewUri(
          vscode.Uri.file(path.join(context.extensionPath, "media", filename))
        );

      panel.webview.html = getWebviewContent(data, webviewUri);
    }
  );

  context.subscriptions.push(disposable);
}

function getWebviewContent(data, webviewUri) {
  const tableData = data.tables || [];
  const jsonData = JSON.stringify(tableData);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <script src="https://unpkg.com/tabulator-tables@5.4.4/dist/js/tabulator.min.js"></script>
      <link href="https://unpkg.com/tabulator-tables@5.4.4/dist/css/tabulator.min.css" rel="stylesheet">
      <link href="${webviewUri("webview.css")}" rel="stylesheet">
    </head>
    <body>
      <div id="table"></div>
      <script>
        const tableData = ${jsonData};
      </script>
      <script src="${webviewUri("webview.js")}"></script>
    </body>
    </html>
  `;
}

function deactivate() {}

module.exports = { activate, deactivate };
