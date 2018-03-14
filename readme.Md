# Installation

 - install [node.js](https://nodejs.org/en/) (tested under v8.6.0)
 - clone git repository
 - navigate to repository
 - run command `npm install`
 - run command `npm install -g forever`
 - run command `forever index.js`
 - open browser to [localhost](http://localhost/)

# Configuration

 - No further configuration should be required

# Known Issues

 - Since this is a toy project I picked the frontend, backend, or database for ease-of-use not scaling. SQLite, in particular, was chosen to enable ease-of-installation rather than scaling. Queries were kept as basic as possible so that any attempt to convert to a different backend would be easier.
 - The implementation uses a lot of async callbacks, so identifying reusable code is somewhat more difficult than normal.
 - I have noticed a few times the frontend has failed to update despite processes succeeding. I found a couple of errors in the process order of the queries which could have been responsible but I was never able to reproduce the issue reliably enough to test if the issue has been fixed.
 - The keyboard-only accessability of this application is really bad. It would require a fair amount of time to go through and write handlers to reset the focus after every DOM rewrite.
 - There's a lot of DOM rewrites.
 - Admin section UI is suboptimal.
 - I may have misinterpretted some of the requirements. On a real project I would have just asked for clarification, but this didn't seem like that kind of project.

 # Improvements

 - UI overhaul with a UX designer because a designer, I am not.
 - Use Lucene and/or move most of the data to a non-relational database (ElasticSearch?) to improve search ability. (Most of the non-inventory count data is write-once making this an optimal usecase. Would have to look into best practices for transactional data in document stores.)
 - Implement data handlers for interacting with the database, in order to make the rest of the code database agnostic.
 - Integrate home and admin pages
 - Add history control
 
# Notes
 - Additional widget attributes and values for those attributes can be added, however there is no interface for this.
