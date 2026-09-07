# Modeling through the entel API

For an agent that models with entel over HTTP and nothing else. Everything below was run against the server as it is; the ids are the ones it answered with.

## Start

    pnpm -F @teloi/entel start

The server listens on http://127.0.0.1:3900. `GET /health` answers `{"status":"ok"}`. `GET /openapi.json` answers the contract, every path, payload and declared response, generated from the same schemas the server validates with. Read it once. It lists the answers the contract declares, including the 400 for a request that breaks a schema rule; that one is declared on every endpoint, including reads that take no payload and cannot produce it. Three answers are not in it. The 404 for a path or method the server does not have and the 415 for a content type other than JSON come from the framework. The empty 500 comes from entel's own middleware. The table at the end has all three.

Every request body is JSON. Send `content-type: application/json`; a request with no content type at all is read as JSON too, and any other content type is refused. A key the schema does not declare is dropped without a word and the request succeeds, so a misspelled key is not an error, it is a silent omission; the OpenAPI document says `additionalProperties: false` and the server does not enforce it. The one exception is `places` on a kind other than tuple, which is refused. Answers that carry a body are JSON. Three answers carry none or plain text, and the table at the end names them: the 404 for a path or method the server does not have, the 415 for a content type other than JSON, and the 500 for a server bug.

Two id spaces look alike and are not interchangeable. An object has an id, and each of its signs has its own id. Places, elements and paths take object ids. An answer that is an object (from creating, getting, listing or adding an element) has the object id at the top and sign ids inside `signs[]`. An answer that is a sign (from adding a name) has a sign id at the top and the object id in `objectId`.

## What a model is

A workspace holds one model. A model has two levels. On the ontological level are objects, the things the model says exist, each of one kind: `individual`, a single thing; `set`, defined by its elements; `tuple`, ordered places each filled by an object; `tupleSet`, a set whose elements are tuples. A relation between things is a tuple, and the kind of relation it is is the tuple set it belongs to. On the semantic level are signs, the names. A sign refers to exactly one object. An object can have several signs. A sign's title is a token, not a description.

Creating an object creates its first sign. A tuple's places are given at creation and never change. Membership is stated on the set. Nothing can be deleted or renamed yet.

## A model in nine requests

Create a workspace. The id in the answer goes into every path after this.

    POST /workspaces                    {"name":"harbour"}
    201 {"id":"ZvIOL_vvJUsqwjLZHEft_","name":"harbour"}

Two individuals. Each answer carries the object's id and its first sign.

    POST /workspaces/ZvIO…/objects      {"kind":"individual","title":"Ship"}
    201 {"id":"6q4HaVmOHWApoEqEDL3lv","kind":"individual",
         "signs":[{"id":"Zi-l…","objectId":"6q4H…","title":"Ship"}],
         "places":[],"elements":[]}
    POST /workspaces/ZvIO…/objects      {"kind":"individual","title":"Anchor"}
    201 {"id":"KCt4Cm73OVbJGqnlezIEf", …}

A set, and Ship as its element. Membership answers the set as it is, with 200, and stating it again answers the same set.

    POST /workspaces/ZvIO…/objects      {"kind":"set","title":"Fleet"}
    201 {"id":"OOfFNjfOLLHEHwDGSR3fj","kind":"set", …}
    POST /workspaces/ZvIO…/objects/OOfF…/elements   {"elementId":"6q4H…"}
    200 {"id":"OOfF…","kind":"set", …, "elements":["6q4H…"]}

A relation. First the kind of relation, a tuple set. Then one instance of it, a tuple with Ship in place one and Anchor in place two. Then the tuple goes into the tuple set. A tuple set takes only tuples.

    POST /workspaces/ZvIO…/objects      {"kind":"tupleSet","title":"has part"}
    201 {"id":"aJnWe3LETtaLNtCXLCpfo","kind":"tupleSet", …}
    POST /workspaces/ZvIO…/objects      {"kind":"tuple","title":"Ship has Anchor",
                                         "places":["6q4H…","KCt4…"]}
    201 {"id":"YfcLb19sXxl8LyYi_zQtM","kind":"tuple", …,
         "places":["6q4H…","KCt4…"],"elements":[]}
    POST /workspaces/ZvIO…/objects/aJnW…/elements   {"elementId":"YfcL…"}
    200 {"id":"aJnW…","kind":"tupleSet", …, "elements":["YfcL…"]}

A second name for Ship.

    POST /workspaces/ZvIO…/objects/6q4H…/signs      {"title":"Vessel"}
    201 {"id":"nfmv…","objectId":"6q4H…","title":"Vessel"}

## Reading back

    GET /workspaces/ZvIO…/objects            every object, creation order, each with signs, places, elements
    GET /workspaces/ZvIO…/objects/6q4H…      one object, same shape
    GET /workspaces/ZvIO…/signs              every sign in the workspace, with its objectId
    GET /signs                               every sign in every workspace, as pairs:
                                             [{"workspaceId":"ZvIO…","sign":{"id":…,"objectId":…,"title":…}}, …]
    GET /workspaces                          every workspace

There is no search and no lookup by title. To find an object by name, list the signs and match the title yourself. There is no paging; a list is the whole table.

## When the server says no

| Status | Body                                                                                                                                             | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `{"_tag":"RequestRejected","part":"Payload","issues":[{"path":["title"],"message":"Expected a string with no leading or trailing whitespace"}]}` | The request broke a schema rule. `part` says which part of the request, `issues` lists what failed with its path from the root of that part. Decoding stops at the first failing key, so a payload with two bad fields reports one; fix it, retry, and read the next answer rather than assuming the list was complete. A title, and a workspace name, is 1 to 200 characters with no surrounding whitespace. Only a tuple takes `places`, and a tuple needs at least one. `kind` is one of the four. Malformed JSON is the same answer with an empty path. One trap: the create payload is a union, and when the request fails, the first member reports its own complaints beside the real one. So a tuple with a bad place gets two issues, one on `kind` saying it expected a placeless kind, and one on the place; the `kind` issue is noise, fix the other. A wrong `kind` gets a message listing only the three placeless kinds; `tuple` is a kind too. |
| 404    | empty                                                                                                                                            | The path or the method is not one the server has. A typo in the path, or a GET on a path that only takes POST, lands here. Nothing about your data is being said; check the request against the OpenAPI document.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 404    | `{"_tag":"WorkspaceNotFound","workspaceId":…}`                                                                                                   | The workspace in the path does not exist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 404    | `{"_tag":"ObjectNotFound","workspaceId":…,"objectId":…}`                                                                                         | The object in the path, a place or an element does not exist in this workspace. Nothing was created.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 409    | `{"_tag":"KindMismatch","objectId":…,"expected":[…],"actual":…}`                                                                                 | Elements went to an individual or a tuple (`expected` is `["set","tupleSet"]`, `objectId` the object you posted to), or a non-tuple went into a tuple set (`expected` is `["tuple"]`, `objectId` the element).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 415    | plain text                                                                                                                                       | The body was sent with a content type other than `application/json`. A header that is truly absent is fine, but most tools set one for you when you pass a body; `curl -d` sends `application/x-www-form-urlencoded` unless you pass the header yourself, and the request lines in the example above omit headers for brevity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 500    | empty                                                                                                                                            | The server failed to encode its own answer. An entel bug, not your request; report it with the request you sent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 503    | `{"_tag":"StoreUnavailable","store":…,"detail":…}`                                                                                               | A store is not answering. `store` is `"registry"` or a workspace id. `detail` says what to do. `"open"`: the store failed to start, the next request tries again. `"persist"`: the write went through but was not confirmed in time, so list before retrying or you make a duplicate. `"commit"` or `"syncStatus"`: the store has shut down and every request to it fails until the server restarts; stop and report, do not retry. `"query"`: usually the same shutdown, but a list over a workspace with more than 32766 objects fails with this detail while the store is fine, so try one small request before concluding the store is dead.                                                                                                                                                                                                                                                                                                               |

## What is not there

Notes and text on an object. Rules beyond the kind checks. Deleting, renaming, moving. References into another workspace. Search, filtering, paging. Authentication. Everything the model says is a title, a kind, a place or a membership.
