// If there's no data, we can't auto-generate columns
if (tableData.length === 0) {
  document.getElementById("table").innerHTML = "<p>No data</p>";
} else {
  const columns = Object.keys(tableData[0]).map(key => ({
    title: key,
    field: key,
    headerFilter: "input",          // <- Enables filter box
    headerFilterPlaceholder: "Filter..."
  }));

  new Tabulator("#table", {
    data: tableData,
    layout: "fitColumns",
    columns: columns
  });
}
