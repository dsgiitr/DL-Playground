# TODO

-   Improve edge naming functionality to link the names of edges which have the same outgoing handle. this ensures consistency in the naming of edges. Inside edge functionality we want the edges to describe which handle they originate from and which edge they go towards.

-   Create a Handle class whose object instances take as input a shape_compute function to send out when it recieves data. if no shape_compute function is provided, the class's default shape compute is used. This handle object can be used by the component factory to create Handles which work independantly for more complex modules.

-   add functionality on the frontend to change the name of layer by the user. this "layer_name" property should update the node data (this "layer_name" property will be used by forward and init code)
-   add functionality to change the name of the module being saved. currently the generator code is hardcoded to create the classname as "GeneratedModule".
-   when a new node is instantiated, its node data should become populated with default values and default names. Currently during instantiation of new nodes, the UI shows default values, but the backend values are still zeros or undefined. Create a universal function which on instantiation of a layer, looks up its param schema and uses that to populate the node data with default values instead of zeros or empty strings.

-   for modules which output multiple tensors, create shape_compute functions which are present on handles or are linked to handles to ensure each output's shape is computed independantly.

-   Create the `Tensor.shape` layer node which takes in an input and dynamically creates its number of handles depending on the number of dimensions of the tensor. Example usage:

```python
B, D = matrix.shape
B, C, H, W = image.shape

```

These integers can be used as arguments for other modules in the future

-   User Defined Arguments: Allow layers to take in parameters as variables instead of exact values. create a UI which enables users to create their own dictionary of values that can be passed in as parameters to the object creation.

```python
class Model(nn.Module):
    def __init__(
        user_def1: int,
        a: int,
        b: bool,
        c: int
    )
    # Layer inits have variables as params
    self.layer1 = nn.Linear(in_features=a,
                            out_featues=b)

    def forward(x):
        ...
```

when computing shapes and generating code, the functions should look up values from the user defined dictionary to confirm if the values are valid or not. The structure of this UI dictionary should be similar to the param_schema format to ensure consistency.

-   Graph saving system: create a system which converts a constructed graph into a downloadable format that can be shared among users as a txt file or our own format. this file can be used by a loader to load configurations from other users. The file should contain the following data.

    -   Information regarding placement and location of nodes
    -   The actual node data
    -   Information regarding the class and if its a derived class or a prebuilt class
    -   information about edge data, names
    -   information about the user-built param dictionary that can be used to reproduce values

-   Repeat functionality and for loops: add functionality to generate repeat loops so that by defining the current value's inputs and output connections, we can repeat them N times to represent long connections. More work needs to be done to flesh out its working

-   our end goal is achieving abstraction and allowing custom modules to be slotted in at any time.
