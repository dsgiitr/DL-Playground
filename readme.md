#Todo
 ```refactor the createlayercomponent to be modular and seperate change handling and input handling into sections```
 ```make the createlayercomponent dependant on data such as number of handles (can be done by implementing functions which compute the number of handles by looking at the data and the inputs as well)```
 ```implement handle naming instead of edge naming or link the 2 on the frontend (unsure if this is needed inside the node or not)```
 ```work out the base implementation for forward pass```
 ```add functionality on the frontend to change the name of layer by the user. this "layer_name" property should update the node data (this "layer_name" property will be used by forward and init code)```
 ```when a new node is instantiated, its node data should become populated with default values and default names```
 ```inside edge functionality we want the edges to describe which handle they originate from and which edge they go towards.```
 ```the shape compute function may become the property of the handles themselves for more complicated modules.```