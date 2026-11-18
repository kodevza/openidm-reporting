// SPDX-License-Identifier: CDDL-1.1
define(['jquery', 'org/forgerock/openidm/ui/common/delegates/ResourceDelegate'], function ($, delegate) {
    return function () {
        if ($('#governance-report-download').length) { return; }
        delegate.getResource('endpoint/governanceReport?capabilities=true').then(function () {
            var link = $('<a href="#" id="governance-report-download">Raport CSV</a>');
            $('#mainNavHolder .navbar-nav').first().append($('<li>').append(link));
            link.on('click', function (event) {
                event.preventDefault();
                if (link.attr('aria-disabled') === 'true') { return; }
                link.attr('aria-disabled', 'true').text('Pobieranie raportu…');
                var parts = [], filename;
                function page(offset) {
                    return delegate.getResource('endpoint/governanceReport?offset=' + offset).then(function (data) {
                        if (!parts.length) { parts.push('\ufeff' + data.header + '\r\n'); filename = data.filename; }
                        if (data.csv) { parts.push(data.csv + '\r\n'); }
                        if (data.nextOffset !== null) { return page(data.nextOffset); }
                        var url = URL.createObjectURL(new Blob(parts, {type:'text/csv;charset=utf-8'})),
                            download = document.createElement('a');
                        download.href = url; download.download = filename;
                        document.body.appendChild(download); download.click(); download.remove();
                        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                    });
                }
                page(0).then(function () {
                    link.text('Raport CSV').attr('aria-disabled', 'false');
                }, function () {
                    link.text('Błąd pobierania — spróbuj ponownie').attr('aria-disabled', 'false');
                });
            });
        }, function () { /* Hidden for users without report access. */ });
    };
});
