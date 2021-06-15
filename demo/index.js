var graph = require('ngraph.graph')();
var graphBuilder = require('../')(httpClient);

var pkgName = process.argv[2] || 'http';
var version = process.argv[3] || 'latest';
console.log('building dependencies graph for', pkgName);

graphBuilder.createNpmDependenciesGraph(pkgName, graph, version).
  then(function (graph) {
    console.log('Done.');
    console.log('Nodes count: ', graph.getNodesCount());
    console.log('Edges count: ', graph.getLinksCount());
    console.log('Graph:');
    var serializer = require('ngraph.serialization/json');
    console.log(serializer.save(graph));
  })
  .catch(function (err) {
    console.error('Failed to build graph: ', err);
  });

function httpClient(url) {
  console.log('Calling: ', url);
  var q = require('q');
  var https = require('https');
  var querystring = require('querystring');

  var defer = q.defer();
  https.get(url, function (res) {
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      body += chunk;
    }).on('end', function () {
      defer.resolve({ data: JSON.parse(body) });
    });
  });

  return defer.promise;
}
