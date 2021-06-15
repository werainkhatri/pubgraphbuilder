var npa = require('npm-package-arg');
var Promise = require('bluebird');
var q = require('q');

module.exports = buildGraph;
module.exports.isRemote = isRemote;

function buildGraph(https, url) {
  url = url || 'https://pub.dev/api/packages/';
  if (url[url.length - 1] !== '/') {
    throw new Error('api url is supposed to end with /');
  }
  var progress;
  var cache = Object.create(null);

  return {
    createNpmDependenciesGraph: createNpmDependenciesGraph,
    notifyProgress: function (cb) {
      progress = cb;
    }
  };

  function createNpmDependenciesGraph(packageName, graph, version) {
    if (!packageName) throw new Error('Initial package name is required');
    if (!graph) throw new Error('Graph data structure is required');
    version = validateVersion(version);

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

      //* since pub packages are not remote
      //* escaping not required since that is specific to npm registry
      
      if(work.name === 'flutter') return getLatestFlutterPackageData(https).then(processRegistryResponse);
      else return https(url + work.name).then(processRegistryResponse);

      function processRegistryResponse(res) {
        var packageData;
        if(res.data) {
          if(res.data.error) {
            throw new Error('Package with the name ' + work.name + ' doesn\'t exist');
          }
          packageData = getVersionedPackageData(res.data, work.version);
          if(!packageData) {
            throw new Error('Package with the version ' + work.version + ' doesn\'t exist');
          }
        } else {
          packageData = res;
        }
        console.log(packageData.pubspec.name + " " + packageData.version);
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
            version: name === 'flutter' ? '' : validateVersion(dependencies[name]),
            parent: id
          })
        }
    }
  }
}

function isRemote(version) {
  return typeof version === 'string' && (
    (version.indexOf('git') === 0) ||
    (version.indexOf('http') === 0) ||
    (version.indexOf('file') === 0)
  );
}

function getVersionedPackageData(data, version) {
  if(version === 'latest' || version === data.latest.version) {
    return data.latest;
  }
  for(var i=0; i<data.versions.length; i++) {
    if(data.versions[i].version === version) return data.versions[i];
  }
}

function validateVersion(version) {
  if (!version || version === 'any') version = 'latest';
  else if(version[0] === '^') version = version.substring(1);
  var semver = require('semver');
  if(version !== 'latest' && semver.valid(version) === null) {
    throw new Error('Incorrect version format: ' + version);
  }
  return version;
}

function getLatestFlutterPackageData(https) {
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
    'version': '2.2.2',
    'pubspec': {
      'version': '2.2.2',
      'name': 'flutter',
      'dependencies': {}
    }
  }
  return new Promise(function(resolve) {
    resolve(packageData);
  });
}