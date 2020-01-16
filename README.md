# Test

You can test by changing directory to:
`cd site`
Then running:
`python -m SimpleHTTPServer 8000`

# deploy

`aws s3 sync site/ s3://predictdb.org`