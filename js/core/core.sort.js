
function _fnSortInit( settings ) {
	var target = settings.nTHead;
	var headerRows = target.querySelectorAll('tr');
	var legacyTop = settings.bSortCellsTop;

	// Legacy support for `orderCellsTop`
	if (legacyTop === true) {
		target = headerRows[0];
	}
	else if (legacyTop === false) {
		target = headerRows[ headerRows.length - 1 ];
	}

	var notSelector = ':not([data-dt-order="disable"]):not([data-dt-order="icon-only"])';
	_fnSortAttachListener(
		settings,
		target,
		'tr'+notSelector+' th'+notSelector+', tr'+notSelector+' td'+notSelector+''
	);

	// Need to resolve the user input array into our internal structure
	var order = [];
	_fnSortResolve( settings, order, settings.aaSorting );

	settings.aaSorting = order;
}


function _fnSortAttachListener(settings, node, selector, column, callback) {
	_fnBindAction( node, selector, function (e) {
		var columns = column === undefined
			? _fnColumnsFromHeader( e.target )
			: [column];

			_fnLog(settings, 0, 'Custom error', 3);

		if ( columns.length ) {
			_fnProcessingDisplay( settings, true );

			// Allow the processing display to show
			setTimeout( function () {
				for ( var i=0, ien=columns.length ; i<ien ; i++ ) {
					var append = e.shiftKey || i > 0;
		
					_fnSortAdd( settings, columns[i], append );
				}
		
				// Run the sort by calling a full redraw
				_fnReDraw( settings );
				_fnProcessingDisplay( settings, false );

				if (callback) {
					callback();
				}
			}, 0);
		}
	} );
}


function _fnSortResolve (settings, nestedSort, sort) {
	var push = function ( a ) {
		if ($.isPlainObject(a)) {
			if (a.idx !== undefined) {
				// Index based ordering
				nestedSort.push([a.idx, a.dir]);
			}
			else if (a.name) {
				// Name based ordering
				var cols = _pluck( settings.aoColumns, 'sName');
				var idx = cols.indexOf(a.name);

				if (idx !== -1) {
					nestedSort.push([idx, a.dir]);
				}
			}
		}
		else {
			// Plain column index and direction pair
			nestedSort.push(a);
		}
	};

	if ( $.isPlainObject(sort) ) {
		// Object
		push(sort);
	}
	else if ( sort.length && typeof sort[0] === 'number' ) {
		// 1D array
		push(sort);
	}
	else if ( sort.length ) {
		// 2D array
		for (var z=0; z<sort.length; z++) {
			push(sort[z]); // Object or array
		}
	}
}


function _fnSortFlatten ( settings )
{
	var
		i, k, kLen,
		aSort = [],
		aoColumns = settings.aoColumns,
		aDataSort, iCol, sType, srcCol,
		fixed = settings.aaSortingFixed,
		fixedObj = $.isPlainObject( fixed ),
		nestedSort = [];
	
	if ( ! settings.oFeatures.bSort ) {
		return aSort;
	}

	// Build the sort array, with pre-fix and post-fix options if they have been
	// specified
	if ( Array.isArray( fixed ) ) {
		_fnSortResolve( settings, nestedSort, fixed );
	}

	if ( fixedObj && fixed.pre ) {
		_fnSortResolve( settings, nestedSort, fixed.pre );
	}

	_fnSortResolve( settings, nestedSort, settings.aaSorting );

	if (fixedObj && fixed.post ) {
		_fnSortResolve( settings, nestedSort, fixed.post );
	}

	for ( i=0 ; i<nestedSort.length ; i++ )
	{
		srcCol = nestedSort[i][0];

		if ( aoColumns[ srcCol ] ) {
			aDataSort = aoColumns[ srcCol ].aDataSort;

			for ( k=0, kLen=aDataSort.length ; k<kLen ; k++ )
			{
				iCol = aDataSort[k];
				sType = aoColumns[ iCol ].sType || 'string';

				if ( nestedSort[i]._idx === undefined ) {
					nestedSort[i]._idx = $.inArray( nestedSort[i][1], aoColumns[iCol].asSorting );
				}

				if ( nestedSort[i][1] ) {
					aSort.push( {
						src:       srcCol,
						col:       iCol,
						dir:       nestedSort[i][1],
						index:     nestedSort[i]._idx,
						type:      sType,
						formatter: DataTable.ext.type.order[ sType+"-pre" ]
					} );
				}
			}
		}
	}

	return aSort;
}

/**
 * Change the order of the table
 *  @param {object} oSettings dataTables settings object
 *  @memberof DataTable#oApi
 */
function _fnSort ( oSettings, col, dir )
{
	var
		i, ien, iLen,
		aiOrig = [],
		oExtSort = DataTable.ext.type.order,
		aoData = oSettings.aoData,
		formatters = 0,
		sortCol,
		displayMaster = oSettings.aiDisplayMaster,
		aSort;

	// Resolve any column types that are unknown due to addition or invalidation
	// @todo Can this be moved into a 'data-ready' handler which is called when
	//   data is going to be used in the table?
	_fnColumnTypes( oSettings );

	// Allow a specific column to be sorted, which will _not_ alter the display
	// master
	if (col !== undefined) {
		var srcCol = oSettings.aoColumns[col];
		aSort = [{
			src:       col,
			col:       col,
			dir:       dir,
			index:     0,
			type:      srcCol.sType,
			formatter: DataTable.ext.type.order[ srcCol.sType+"-pre" ]
		}];
		displayMaster = displayMaster.slice();
	}
	else {
		aSort = _fnSortFlatten( oSettings );
	}

	for ( i=0, ien=aSort.length ; i<ien ; i++ ) {
		sortCol = aSort[i];

		// Track if we can use the fast sort algorithm
		if ( sortCol.formatter ) {
			formatters++;
		}

		// Load the data needed for the sort, for each cell
		_fnSortData( oSettings, sortCol.col );
	}

	/* No sorting required if server-side or no sorting array */
	if ( _fnDataSource( oSettings ) != 'ssp' && aSort.length !== 0 )
	{
		// Reset the initial positions on each pass so we get a stable sort
		for ( i=0, iLen=displayMaster.length ; i<iLen ; i++ ) {
			aiOrig[ i ] = i;
		}

		// If the first sort is desc, then reverse the array to preserve original
		// order, just in reverse
		if (aSort.length && aSort[0].dir === 'desc') {
			aiOrig.reverse();
		}

		/* Do the sort - here we want multi-column sorting based on a given data source (column)
		 * and sorting function (from oSort) in a certain direction. It's reasonably complex to
		 * follow on it's own, but this is what we want (example two column sorting):
		 *  fnLocalSorting = function(a,b){
		 *    var iTest;
		 *    iTest = oSort['string-asc']('data11', 'data12');
		 *      if (iTest !== 0)
		 *        return iTest;
		 *    iTest = oSort['numeric-desc']('data21', 'data22');
		 *    if (iTest !== 0)
		 *      return iTest;
		 *    return oSort['numeric-asc']( aiOrig[a], aiOrig[b] );
		 *  }
		 * Basically we have a test for each sorting column, if the data in that column is equal,
		 * test the next column. If all columns match, then we use a numeric sort on the row
		 * positions in the original data array to provide a stable sort.
		 *
		 * Note - I know it seems excessive to have two sorting methods, but the first is around
		 * 15% faster, however, presort isn't always possible (e.g. natural sorting), so we
		 * maintain both.
		 */
		if ( formatters === aSort.length ) {
			// All sort types have formatting functions
			displayMaster.sort( function ( a, b ) {
				var
					x, y, k, test, sort,
					len=aSort.length,
					dataA = aoData[a]._aSortData,
					dataB = aoData[b]._aSortData;

				for ( k=0 ; k<len ; k++ ) {
					sort = aSort[k];

					x = dataA[ sort.col ];
					y = dataB[ sort.col ];

					test = x<y ? -1 : x>y ? 1 : 0;
					if ( test !== 0 ) {
						return sort.dir === 'asc' ? test : -test;
					}
				}

				x = aiOrig[a];
				y = aiOrig[b];
				return x<y ? -1 : x>y ? 1 : 0;
			} );
		}
		else {
			// Not all sort types have pre-formatting methods, so we have to call their sorting
			// methods.
			displayMaster.sort( function ( a, b ) {
				var
					x, y, k, l, test, sort, fn,
					len=aSort.length,
					dataA = aoData[a]._aSortData,
					dataB = aoData[b]._aSortData;

				for ( k=0 ; k<len ; k++ ) {
					sort = aSort[k];

					x = dataA[ sort.col ];
					y = dataB[ sort.col ];

					fn = oExtSort[ sort.type+"-"+sort.dir ] || oExtSort[ "string-"+sort.dir ];
					test = fn( x, y );
					if ( test !== 0 ) {
						return test;
					}
				}

				x = aiOrig[a];
				y = aiOrig[b];
				return x<y ? -1 : x>y ? 1 : 0;
			} );
		}
	}
	else if ( aSort.length === 0 ) {
		displayMaster.sort(); // Apply index order
	}

	/* Tell the draw function that we have sorted the data */
	oSettings.bSorted = true;

	return displayMaster;
}


/**
 * Function to run on user sort request
 *  @param {object} settings dataTables settings object
 *  @param {node} attachTo node to attach the handler to
 *  @param {int} colIdx column sorting index
 *  @param {boolean} [append=false] Append the requested sort to the existing
 *    sort if true (i.e. multi-column sort)
 *  @param {function} [callback] callback function
 *  @memberof DataTable#oApi
 */
function _fnSortAdd ( settings, colIdx, append )
{
	var col = settings.aoColumns[ colIdx ];
	var sorting = settings.aaSorting;
	var asSorting = col.asSorting;
	var nextSortIdx;
	var next = function ( a, overflow ) {
		var idx = a._idx;
		if ( idx === undefined ) {
			idx = $.inArray( a[1], asSorting );
		}

		return idx+1 < asSorting.length ?
			idx+1 :
			overflow ?
				null :
				0;
	};

	if ( ! col.bSortable ) {
		return;
	}

	// Convert to 2D array if needed
	if ( typeof sorting[0] === 'number' ) {
		sorting = settings.aaSorting = [ sorting ];
	}

	// If appending the sort then we are multi-column sorting
	if ( append && settings.oFeatures.bSortMulti ) {
		// Are we already doing some kind of sort on this column?
		var sortIdx = $.inArray( colIdx, _pluck(sorting, '0') );

		if ( sortIdx !== -1 ) {
			// Yes, modify the sort
			nextSortIdx = next( sorting[sortIdx], true );

			if ( nextSortIdx === null && sorting.length === 1 ) {
				nextSortIdx = 0; // can't remove sorting completely
			}

			if ( nextSortIdx === null ) {
				sorting.splice( sortIdx, 1 );
			}
			else {
				sorting[sortIdx][1] = asSorting[ nextSortIdx ];
				sorting[sortIdx]._idx = nextSortIdx;
			}
		}
		else {
			// No sort on this column yet
			sorting.push( [ colIdx, asSorting[0], 0 ] );
			sorting[sorting.length-1]._idx = 0;
		}
	}
	else if ( sorting.length && sorting[0][0] == colIdx ) {
		// Single column - already sorting on this column, modify the sort
		nextSortIdx = next( sorting[0] );

		sorting.length = 1;
		sorting[0][1] = asSorting[ nextSortIdx ];
		sorting[0]._idx = nextSortIdx;
	}
	else {
		// Single column - sort only on this column
		sorting.length = 0;
		sorting.push( [ colIdx, asSorting[0] ] );
		sorting[0]._idx = 0;
	}
}


/**
 * Set the sorting classes on table's body, Note: it is safe to call this function
 * when bSort and bSortClasses are false
 *  @param {object} oSettings dataTables settings object
 *  @memberof DataTable#oApi
 */
function _fnSortingClasses( settings )
{
	var oldSort = settings.aLastSort;
	var sortClass = settings.oClasses.sSortColumn;
	var sort = _fnSortFlatten( settings );
	var features = settings.oFeatures;
	var i, ien, colIdx;

	if ( features.bSort && features.bSortClasses ) {
		// Remove old sorting classes
		for ( i=0, ien=oldSort.length ; i<ien ; i++ ) {
			colIdx = oldSort[i].src;

			// Remove column sorting
			$( _pluck( settings.aoData, 'anCells', colIdx ) )
				.removeClass( sortClass + (i<2 ? i+1 : 3) );
		}

		// Add new column sorting
		for ( i=0, ien=sort.length ; i<ien ; i++ ) {
			colIdx = sort[i].src;

			$( _pluck( settings.aoData, 'anCells', colIdx ) )
				.addClass( sortClass + (i<2 ? i+1 : 3) );
		}
	}

	settings.aLastSort = sort;
}


// Get the data to sort a column, be it from cache, fresh (populating the
// cache), or from a sort formatter
function _fnSortData( settings, idx )
{
	// Custom sorting function - provided by the sort data type
	var column = settings.aoColumns[ idx ];
	var customSort = DataTable.ext.order[ column.sSortDataType ];
	var customData;

	if ( customSort ) {
		customData = customSort.call( settings.oInstance, settings, idx,
			_fnColumnIndexToVisible( settings, idx )
		);
	}

	// Use / populate cache
	var row, cellData;
	var formatter = DataTable.ext.type.order[ column.sType+"-pre" ];

	for ( var i=0, ien=settings.aoData.length ; i<ien ; i++ ) {
		row = settings.aoData[i];

		if ( ! row._aSortData ) {
			row._aSortData = [];
		}

		if ( ! row._aSortData[idx] || customSort ) {
			cellData = customSort ?
				customData[i] : // If there was a custom sort function, use data from there
				_fnGetCellData( settings, i, idx, 'sort' );

			row._aSortData[ idx ] = formatter ?
				formatter( cellData ) :
				cellData;
		}
	}
}

