// https://github.com/awslabs/aws-js-s3-explorer


var trackOutboundLink = function(url) {
       ga('send', 'event', 'outbound', 'click', url, {
         'transport': 'beacon',
         'hitCallback': function(){document.location = url;}
       });
}

var s3exp_config = {Bucket: 'predictdb2', Prefix: '', Delimiter: '/' };

var s3exp_lister = null;
var s3exp_columns = { key:1, folder:2, date:3, size:4 };

AWS.config.region = 'us-east-1';
console.log('Region: ' + AWS.config.region);

var s3 = new AWS.S3();
moment().format();

function bytesToSize(bytes) {
    var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes == 0) return '0 Bytes';
    var ii = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, ii), 2) + ' ' + sizes[ii];
};

if (typeof String.prototype.endsWith != 'function') {
    String.prototype.endsWith = function (str){
        return this.slice(-str.length) == str;
    };
}

function object2href(bucket, object) {
    return "https://s3.amazonaws.com/" + bucket + "/" + object;
}

function isfolder(path) {
    return path.endsWith('/');
}

function fullpath2filename(path) {
    return path.replace(/^.*[\\\/]/, '');
}

function fullpath2pathname(path) {
    return path.substring(0, path.lastIndexOf("/"));
}

function prefix2folder(prefix) {
    var parts = prefix.split('/');
    return parts[parts.length-2] + '/';
}

function folder2breadcrumbs(data) {
    console.log('Bucket: ' + data.params.Bucket);
    console.log('Prefix: ' + data.params.Prefix);

    var parts = [data.params.Bucket];

    if (data.params.Prefix) {
        parts.push.apply(parts,
                         data.params.Prefix.endsWith('/') ?
                         data.params.Prefix.slice(0, -1).split('/') :
                         data.params.Prefix.split('/'));
    }

    console.log('Parts: ' + parts + ' (length=' + parts.length + ')');

    $('#breadcrumb li').remove();

    var buildprefix = '';
    $.each(parts, function(ii, part) {
        var ipart;

        if (ii == 0) {
            var a = $('<a>').attr('href', '#').text(part);
            ipart = $('<li>').append(a);
            a.click(function(e) {
                e.preventDefault();
                console.log('Breadcrumb click bucket: ' + data.params.Bucket);
                s3exp_config = {Bucket: data.params.Bucket, Prefix: '', Delimiter: data.params.Delimiter};
                (s3exp_lister = s3list(s3exp_config, s3draw)).go();
            });
        } else {
            buildprefix += part + '/';

            if (ii == parts.length - 1) {
                ipart = $('<li>').addClass('active').text(part);
            } else {
                var a = $('<a>').attr('href', '#').append(part);
                ipart = $('<li>').append(a);

                (function() {
                    var saveprefix = buildprefix;
                    a.click(function(e) {
                        e.preventDefault();
                        console.log('Breadcrumb click object prefix: ' + saveprefix);
                        s3exp_config = {Bucket: data.params.Bucket, Prefix: saveprefix, Delimiter: data.params.Delimiter};
                        (s3exp_lister = s3list(s3exp_config, s3draw)).go();
                    });
                })();
            }
        }
        $('#breadcrumb').append(ipart);
    });
}

function s3draw(data, complete) {
    $('li.li-bucket').remove();
    folder2breadcrumbs(data);

    $.each(data.CommonPrefixes, function(i, prefix) {
        $('#tb-s3objects').DataTable().rows.add([{Key: prefix.Prefix}]);
    });

    $('#tb-s3objects').DataTable().rows.add(data.Contents).draw();
}

function s3list(params, completecb) {
    console.log('s3list: ' + JSON.stringify(params));
    var scope = {
        Contents: [], CommonPrefixes:[], params: params, stop: false, completecb: completecb
    };

    return {
        cb: function (err, data) {
            if (err) {
                console.log('Error: ' + JSON.stringify(err));
                console.log('Error: ' + err.stack);
                scope.stop = true;
                bootbox.alert("Error accessing S3 bucket " + scope.params.Bucket + ". Error: " + err);
            } else {
                if (data.IsTruncated) {
                    if (data.NextMarker) {
                        scope.params.Marker = data.NextMarker;
                    } else if (data.Contents.length > 0) {
                        scope.params.Marker = data.Contents[data.Contents.length - 1].Key;
                    }
                }

                console.log("Filter: remove folders");
                data.Contents = data.Contents.filter(function(el) {
                    return el.Key !== scope.params.Prefix;
                });

                scope.Contents.push.apply(scope.Contents, data.Contents);
                scope.CommonPrefixes.push.apply(scope.CommonPrefixes, data.CommonPrefixes);

                if (scope.stop) {
                    console.log('Bucket ' + scope.params.Bucket + ' stopped');
                } else if (data.IsTruncated) {
                    console.log('Bucket ' + scope.params.Bucket + ' truncated');
                    s3.makeUnauthenticatedRequest('listObjects', scope.params, scope.cb);
                } else {
                    console.log('Bucket ' + scope.params.Bucket + ' has ' + scope.Contents.length + ' objects, including ' + scope.CommonPrefixes.length + ' prefixes');
                    delete scope.params.Marker;
                    if (scope.completecb) {
                        scope.completecb(scope, true);
                    }
                }
            }
        },

        go: function () {
            scope.cb = this.cb;
            $('#tb-s3objects').DataTable().clear();
            s3.makeUnauthenticatedRequest('listObjects', scope.params, this.cb);
        },

        stop: function () {
            scope.stop = true;
            delete scope.params.Marker;
            if (scope.completecb) {
                scope.completecb(scope, false);
            }
        }
    };
}

function promptForBucketInput() {
    bootbox.prompt("Please enter the S3 bucket name", function(result) {
        if (result !== null) {
            s3exp_config = { Bucket: result, Delimiter: '/' };
            (s3exp_lister = s3list(s3exp_config, s3draw)).go();
        }
    });
}

$(document).ready(function(){
    console.log('ready');

    $('#bucket-chooser').click(function(e) {
        promptForBucketInput();
    });

    function renderKey(data, type, full) {
        if (isfolder(data)) {
            return '<a data-s3="folder" data-prefix="' + data + '" href="' + object2href(s3exp_config.Bucket, data) + '">' + prefix2folder(data) + '</a>';
        } else {
            return '<a data-s3="object" href="' + object2href(s3exp_config.Bucket, data) + '">' + fullpath2filename(data) + '</a>';
        }
    }

    $('#tb-s3objects').DataTable({
        iDisplayLength: 10,
        order: [[1, 'asc'], [0, 'asc']],
        aoColumnDefs: [
            { "aTargets": [ 0 ], "mData": "Key", "mRender": function (data, type, full) { return (type == 'display') ? renderKey(data, type, full) : data; }, "sType": "key" },
            { "aTargets": [ 1 ], "mData": "Key", "mRender": function (data, type, full) { return isfolder(data) ? "" : fullpath2pathname(data); } },
            { "aTargets": [ 2 ], "mData": "LastModified", "mRender": function (data, type, full) { return data ? moment(data).format('YYYY-MM-DD') : ""; } },
            { "aTargets": [ 3 ], "mData": function (source, type, val) { return source.Size ? ((type == 'display') ? bytesToSize(source.Size) : source.Size) : "" } },
        ], 
        "deferRender":    true,
        "scrollY":         "300px",
        "scrollX":         true,
        "scroller":       true,
        // "stateSave":       true, 
        "scrollCollapse": true,
        // "paging":         true,
        // "responsive": true, 
        "displayLength": 100,
    });

    $('#tb-s3objects').DataTable().column(s3exp_columns.key).visible(false);
    console.log("jQuery version=" + $.fn.jquery);

    $.fn.dataTableExt.oSort['key-asc']  = function(a,b) {
        var x = (isfolder(a) ? "0-" + a : "1-" + a).toLowerCase();
        var y = (isfolder(b) ? "0-" + b : "1-" + b).toLowerCase();
        return ((x < y) ? -1 : ((x > y) ?  1 : 0));
    };

    $.fn.dataTableExt.oSort['key-desc'] = function(a,b) {
        var x = (isfolder(a) ? "1-" + a : "0-" + a).toLowerCase();
        var y = (isfolder(b) ? "1-" + b : "0-" + b).toLowerCase();
        return ((x < y) ? 1 : ((x > y) ? -1 : 0));
    }

    $('#tb-s3objects').on('click', 'a', function(event) {
        event.preventDefault();
        var target = event.target;
        console.log("target href=" + target.href);
        console.log("target dataset=" + JSON.stringify(target.dataset));

        if (target.dataset.s3 === "folder") {
            delete s3exp_config.Marker;
            s3exp_config.Prefix = target.dataset.prefix;
            s3exp_config.Delimiter = "/";
            (s3exp_lister = s3list(s3exp_config, s3draw)).go();
        } else {
            window.open(target.href, '_blank');
        }
    });

    var urls = document.URL.split('/');

    if (s3exp_config.Bucket) {
        (s3exp_lister = s3list(s3exp_config, s3draw)).go();
    } else if (urls[urls.length - 3] == 's3.amazonaws.com') {
        console.log("Found s3.amazonaws.com, bucket: " + urls[urls.length - 2]);
        s3exp_config = { Bucket: urls[urls.length - 2], Delimiter: '/' };
        (s3exp_lister = s3list(s3exp_config, s3draw)).go();
    } else {
        promptForBucketInput();
    }
})