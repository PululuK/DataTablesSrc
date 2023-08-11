
var __searchCounter = 0;

// opts
// - text
// - placeholder
_ext.features.register( 'search', function ( settings, opts ) {
	// Don't show the input if filtering isn't available on the table
	if (! settings.oFeatures.bFilter) {
		return null;
	}

	var classes = settings.oClasses;
	var tableId = settings.sTableId;
	var language = settings.oLanguage;
	var previousSearch = settings.oPreviousSearch;
	var input = '<input type="search" class="'+classes.sFilterInput+'"/>';

	opts = $.extend({
		placeholder: language.sSearchPlaceholder,
		text: language.sSearch
	}, opts);

	// The _INPUT_ is optional - is appended if not present
	if (opts.text.indexOf('_INPUT_') === -1) {
		opts.text += '_INPUT_';
	}

	// We can put the <input> outside of the label if it is at the start or end
	// which helps improve accessability (not all screen readers like implicit
	// for elements).
	var end = opts.text.match(/_INPUT_$/);
	var start = opts.text.match(/^_INPUT_/);
	var removed = opts.text.replace(/_INPUT_/, '');
	var str = '<label>' + opts.text + '</label>';

	if (start) {
		str = '_INPUT_<label>' + removed + '</label>';
	}
	else if (end) {
		str = '<label>' + removed + '</label>_INPUT_';
	}

	var filter = $('<div>')
		.addClass(classes.sFilter)
		.append(str.replace(/_INPUT_/, input));

	// add for and id to label and input
	filter.find('label').attr('for', 'dt-search-' + __searchCounter);
	filter.find('input').attr('id', 'dt-search-' + __searchCounter);
	__searchCounter++;

	var searchFn = function(event) {
		var val = this.value;

		if(previousSearch.return && event.key !== "Enter") {
			return;
		}

		/* Now do the filter */
		if ( val != previousSearch.sSearch ) {
			_fnFilterComplete( settings, {
				"sSearch": val,
				"bRegex": previousSearch.bRegex,
				"bSmart": previousSearch.bSmart ,
				"bCaseInsensitive": previousSearch.bCaseInsensitive,
				"return": previousSearch.return
			} );

			// Need to redraw, without resorting
			settings._iDisplayStart = 0;
			_fnDraw( settings );
		}
	};

	var searchDelay = settings.searchDelay !== null ?
		settings.searchDelay :
		_fnDataSource( settings ) === 'ssp' ?
			400 :
			0;

	var jqFilter = $('input', filter)
		.val( previousSearch.sSearch )
		.attr( 'placeholder', opts.placeholder )
		.on(
			'keyup.DT search.DT input.DT paste.DT cut.DT',
			searchDelay ?
				_fnThrottle( searchFn, searchDelay ) :
				searchFn
		)
		.on( 'mouseup.DT', function(e) {
			// Edge fix! Edge 17 does not trigger anything other than mouse events when clicking
			// on the clear icon (Edge bug 17584515). This is safe in other browsers as `searchFn`
			// checks the value to see if it has changed. In other browsers it won't have.
			setTimeout( function () {
				searchFn.call(jqFilter[0], e);
			}, 10);
		} )
		.on( 'keypress.DT', function(e) {
			/* Prevent form submission */
			if ( e.keyCode == 13 ) {
				return false;
			}
		} )
		.attr('aria-controls', tableId);

	// Update the input elements whenever the table is filtered
	$(settings.nTable).on( 'search.dt.DT', function ( ev, s ) {
		if ( settings === s ) {
			if ( jqFilter[0] !== document.activeElement ) {
				jqFilter.val( previousSearch.sSearch );
			}
		}
	} );

	return filter;
} );