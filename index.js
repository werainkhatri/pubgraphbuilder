var semver = require('semver');

module.exports = buildGraph;

function buildGraph(https, url) {
  url = url || 'https://pub.dev/api/packages/';
  if (url[url.length - 1] !== '/') {
    throw new Error('api url is supposed to end with /');
  }
  var progress;
  var cache = Object.create(null);

  return {
    createPubDependenciesGraph: createPubDependenciesGraph,
    notifyProgress: function (cb) {
      progress = cb;
    }
  };

  function createPubDependenciesGraph(packageName, graph, version) {
    if (!packageName) throw new Error('Initial package name is required');
    if (!graph) throw new Error('Graph data structure is required');
    if (!version || version === 'any') version = 'latest';
    else if(semver.valid(version) === null) throw new Error('Incorrect version format: ' + version);

    var queue = [];
    var processed = Object.create(null);

    queue.push({
      name: packageName,
      version: version,
      parent: null
    });

    return processQueue(graph);

    function processQueue(graph) {
      if (typeof progress === 'function') {
        progress(queue.length);
      }

      var work = queue.pop();

      var cached = cache[getCacheKey(work)];
      if (cached) {
        return new Promise(function(resolve) {
          resolve(processRegistryResponse(cached));
        });
      }
      
      if(work.name === 'flutter' || work.name === 'flutter_test' || work.name === 'flutter_web_plugins') 
        return getLatestFlutterPackageData(work.name, work.version).then(processRegistryResponse);
      else return https(url + work.name).then(processRegistryResponse);

      function processRegistryResponse(res) {
        var packageData;
        if(res.data) {
          if(res.data.error) {
            throw new Error('Package with the name ' + work.name + ' doesn\'t exist');
          }
          packageData = getVersionedPackageData(res.data, work.version);
          if(!packageData) {
            throw new Error('Package ' + work.name +' with the version ' + work.version + ' doesn\'t exist');
          }
        } else {
          packageData = res;
        }
        cache[getCacheKey(work)] = packageData;
        traverseDependencies(work, packageData);

        if (queue.length) {
          // continue building the graph
          return processQueue(graph);
        }

        return graph;
      }
    }

    function getCacheKey(work) {
      return work.name + work.version;
    }

    function traverseDependencies(work, pkg) {
      var version, id;
      version = pkg.version;
      id = pkg.pubspec.name + '@' + version;

      // TODO: here is a good place to address https://github.com/anvaka/npmgraph.an/issues/4
      var dependencies = pkg.pubspec.dependencies;

      graph.beginUpdate();

      graph.addNode(id, pkg);

      if (work.parent && !graph.hasLink(work.parent, id)) {
        graph.addLink(work.parent, id);
      }

      graph.endUpdate();

      if (processed[id]) {
        // no need to enqueue this package again - we already downloaded it before
        return;
      }
      processed[id] = true;

      if (dependencies) {
        Object.keys(dependencies).forEach(addToQueue);
      }

      function addToQueue(name) {
          queue.push({
            name: name,
            version: name === 'flutter' || name === 'flutter_test' || name === 'flutter_web_plugins' ? '' : validateVersion(dependencies[name]),
            parent: id
          })
        }
    }
  }
}

function getVersionedPackageData(data, version) {
  if(version === 'latest' || version === data.latest.version) {
    return data.latest;
  }
  // TODO binary search using semver
  for(var i=0; i<data.versions.length; i++) {
    if(semver.gte(data.versions[i].version, version)) return data.versions[i];
  }
}

function validateVersion(version) {
  if (!version || version === 'any') version = 'latest';
  else if(version[0] === '^') version = version.substring(1);
  else if(semver.valid(version) === null) version = semver.minVersion(version);
  return version;
}

function getLatestFlutterPackageData(name, version) {
  if(version === '') version = '2.2.2';
  // TODO get latest version of flutter
  // const flutterurl = 'https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json';
  // var defer = q.defer();
  // https(flutterurl).then(function(res) {
  //     version = res.releases[0].version;
  //     var packageData = {
  //       'version': version,
  //       'pubspec': {
  //         'version': version,
  //         'name': 'flutter',
  //         'dependencies': {}
  //       }
  //     };
  //     defer.resolve(packageData);
  // });
  // return defer.promise;
  var packageData = {
    'version': version,
    'pubspec': {
      'version': version,
      'name': name,
      'description': "Flutter is Google's UI toolkit for building beautiful, natively compiled applications for mobile, web, desktop, and embedded devices from a single codebase. ",
      'dependencies': {}
    }
  }
  return new Promise(function(resolve) {
    resolve(packageData);
  });
}