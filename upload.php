<?php
 	$filepath=$_SERVER['DOCUMENT_ROOT'].'/recorder_uploads/';  // insert your path on server here

	// pull the raw binary data from the POST array
	$data = substr($_POST['data'], strpos($_POST['data'], ",") + 1);
	// decode it
	$decodedData = base64_decode($data);
	// print out the raw data, 
	$filename = urldecode($_POST['fname']);
	// write the data out to the file
	$source_file = $filepath.$filename;
	$fp = fopen($source_file, 'wb');
	fwrite($fp, $decodedData);
	fclose($fp);
?>
