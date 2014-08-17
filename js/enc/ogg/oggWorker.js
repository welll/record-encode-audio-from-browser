importScripts('vorbis.js');

var state;

self.onmessage = function(e) {

	switch (e.data.command) {

		case 'init':
			init(e.data.config);
			break;
		case 'encode':
			//encode(e);
			break;
		case 'finish':
			//finish();
			break;
	}
};

function init(config) {

	if (!config) {
		config = {};
	}

	state = Module._lexy_encoder_start(44100, 3);

}

function encode(e) {

	var left_buffer = e.data.buf;
	var right_buffer = e.data.buf;

	// Allocate memory using _malloc
	var left_buffer_ptr = Module._malloc(left_buffer.length * left_buffer.BYTES_PER_ELEMENT);
	var right_buffer_ptr = Module._malloc(right_buffer.length * right_buffer.BYTES_PER_ELEMENT);

	// Set the buffer values in memory
	Module.HEAPF32.set(left_buffer, left_buffer_ptr >> 2);
	Module.HEAPF32.set(right_buffer, right_buffer_ptr >> 2);

	var buffer_length = 1; //Module._lexy_get_buffer_length(state);

	// Write data to encoder
	Module._lexy_encoder_write(state, left_buffer_ptr, right_buffer_ptr, buffer_length);

	// Free the memory
	Module._free(left_buffer_ptr);
	Module._free(right_buffer_ptr);

	self.postMessage({
		command: 'signal'
	});
}

function finish() {

	Module._lexy_encoder_finish(state);

	var ogg_ptr = Module._lexy_get_buffer(state);
	var ogg_data = Module.HEAPU8.subarray(ptr, ptr + Module._lexy_get_buffer_length(state));

	var ogg_blob = new Blob([ogg_data], {
		type: 'audio/ogg'
	});

	self.postMessage({
		command: 'ogg',
		buf: ogg_blob
	});

}