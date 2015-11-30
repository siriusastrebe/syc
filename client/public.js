var socket = io.connect();
Syc.connect(socket);

angular.module('syctest', [])
.controller('ctrl', function ($scope) { 
    setTimeout(function () { 
      $scope.data = Syc.list();
      $scope.$apply();

      Syc.watch_recursive(Syc.list('YO'), function (c, socket) {
        console.log(c, socket)
        $scope.$apply();
      });

      Syc.watch(Syc.list('NO'), function (c, socket) { 
        $scope.test(c, socket);
        $scope.$apply();
      });

      Syc.watch(Syc.list('WHOA'), function (c, socket) { 
        $scope.test(c, socket);
        $scope.$apply();
      });

      Syc.watch(Syc.list('GO'), function (c, socket) { 
        $scope.test(c, socket);
        $scope.$apply();
      });
    }, 1000);



    $scope.recurrable = function (value) {
      return (Syc.type(value) === 'array' || Syc.type(value) === 'object');
    }

    $scope.type = function (value) { 
      return Syc.type(value);
    }

    $scope.marked = {};

    $scope.unmark_all = function () { 
      console.log('Unmarking');
      $scope.marked = {};
    }

    $scope.id = function (value) { 
      return value['syc-object-id'];
    }

    $scope.start = function () { 
      console.log('starting...');
      var test = Syc.list('NO');

      if (test.first === false) { 
        test.first = true;
        $scope.role = 1;

        $scope.results = "Test accepted. ";
        $scope.actions = "Waiting for a second client to accept the test.";
      } else if (test.second === false) { 
        test.second = true;
        $scope.role = 0;

        $scope.results = "Test accepted. ";
        $scope.actions = "Setting stage to 1. Waiting for stage to be set to 2.";

        test.started = true;
        test.stage = 1;
      }
    }

    $scope.test = function (changes, socket) { 
      $scope.testing = true;

      var testsuite = [
        {
          2: function ($scope, test) { 
            $scope.results = "√ (2) Stage set to 2."
            $scope.actions = "(3) Stage set to 'three'. Waiting on an array of values."
            test.stage = 'three'
          },
          4: function ($scope, test) { 
            if (test.data) { 
              if (test.data.length === 3 &&
                  test.data[0] === 'one' &&
                  test.data[1] === 2 &&
                  test.data[2] === 'three') {
                $scope.results = "√ (4) Addition of an array of values."
                test.data.push(4);
              } else { 
                $scope.results = "X (4) Addition of an array failed."
              }
            }

            $scope.actions = "Waiting 1 second to start the next test...." 

            setTimeout(function () { 
              $scope.actions = "(5) Creating a new array with a massive number of entries. Awaiting deletion of certain array entries."
              test.data = [];
              for (var i = 0; i<1000; i++) {
                test.data.push(i);
              }
              test.stage = 5;
              $scope.$apply();
            }, 1000);
          },
          6: function ($scope, test) { 
            var failed = false;
            if (test.data.length !== 1000) { 
              failed = true;
              $scope.results = "X (6) Test failed. Expected an array size of 1000, but the array is size " + test.data.length + ".";
            }
            for (var i = 0; i < test.data.length; i+=69) {
              if (test.data[i] !== undefined) { 
                failed = true;
                $scope.results = "X (6) Test failed. Array index " + i + " with value " + test.data[i] + " was not deleted.";
              } 
            }
            if (!failed) { 
              $scope.results = "√ (6) Specific array elements deleted."
              $scope.actions = " (7) Removing the first item off the array";
              test.data.shift();
              test.stage = 7;
            }
          },
          8: function ($scope, test) { 
            if (Syc.type(test.data.a) !== 'array' || test.data.a.length !== 3 || test.data.a[0] !== 0 || test.data.a[1] !== 1 || test.data.a[2] !== 2) {
              $scope.results = "X (8) Test.data.a is not an array consisting of [0, 1, 2].";
            } else if (Syc.type(test.data.b) !== 'array' || test.data.b.length !== 3 || test.data.b[0] !== 'zero' || test.data.b[1] !== 'one' || test.data.b[2] !== 'two') {
              $scope.results = "X (8) data.b is not an array consisting of ['zero', 'one', 'two'].";
            } else if (test.data.c !== test.data.a) {
              $scope.results = "X (8) data.c does not equal data.a";
            } else {
              $scope.results = "√ (8) Received the expected object.";
              $scope.actions = "(9) Adding another level of self-reference to the object.";
              console.log(test);
              test.data.a.push(test.data.b);
              test.stage = 9;
            }
          },
          11: function ($scope, test, listing, changes) { 
            $scope.actions = "(11) Creating a complex change in the read-only variable."
            var readonly = listing['WHOA'];
            readonly.azz = "once"
            readonly.bazz = "deuce"
            readonly.spazz = [{a: 'a'}, ['b', 'c']];
            test.stage = 12;
          },
          12: function ($scope, test, listing, changes) {
            if (changes.type === 'delete') {
              var populated = false;
              for (var property in changes.variable) {
                populated = property;
              }
              if (populated) {
                $scope.results = "X (12) One or more changes to a readonly variable taken effect. Offending property: " + populated + ".";
              } else {
                $scope.results = "√ (12) illegal changes reverted."
                test.stage = 13;
              }
            } else {
              $scope.results = "X (12) Received the wrong change type " + changes.type + ".";
            }
          }

/*          10: function ($scope, test, readonly) {
            $scope.actions = "(10) Modifying a read only variable with a complex data structure.";
            readonly.b = {10000: "Ten thousand.", deeper: "oh yes, give it to me", deepest: [{me: "so ho-ny"}, "oh yes"]};
            setTimeout(function () { 
              if (readonly.b === undefined) {
                $scope.results = "√ (10) Readonly variable successfully unmodified.";
              } else {
                $scope.results = "X (10) Readonly variable is retaining its changes.";
              }
              $scope.$apply();
              $scope.actions = "(11) Attempting to reference a readonly variable from a globally accessible one."
              test.readonly = readonly;
              test.stage = 11;
            }, 2000);
          },
          success: function ($scope, test) { 
            $scope.actions = "√ All tests passed successfully. End of test.";
            $scope.results = "√ All tests passed successfully. End of test.";
          }*/
        },
        {
          1: function ($scope, test) { 
						$scope.results = "√ (1) Test initiated.\n(2)" 
            $scope.actions = "(2) Setting stage # 2. Waiting for stage 'three'" 
            setTimeout(function () { 
              test.stage = 2;
            }, 5000)
          },
          three: function ($scope, test) { 
            $scope.results = "√ (three) Object property modification."
            $scope.actions = "(4) Created an array... Awaiting on a new, massive array." 
            test.data = ['one', 2, 'three'];
            test.stage = 4;
          },
          5: function ($scope, test) { 
            var failed = false;
            $scope.actions = "(5) Test completed." 

            if (!(test.data.length === 1000)) { 
              $scope.failed = true;
              $scope.results = "X (5) Array length does not match. Expected length 1000, Received length: " + test.data.length + ".";
            } else {
              for (var i = 0; i<1000; i++) {
                if (test.data[i] !== i) { 
                  $scope.results = "X (5) Array numbers do not match. First conflicting number: " + test.data[i] + " in index " + i + ".";
                  failed = true;
                }
              }
              if (!failed) { 
                $scope.results = "√ (5) Received a massive array of data.";
                $scope.actions = "(6) Waiting 1 second to start the next test...";
                setTimeout(function () {
                  $scope.actions = "(6) Deleting select indicies from the array."; 
                  for (var i = 0; i < 1000; i+=69) {
                    delete test.data[i];
                  }
                  test.stage = 6;
                  $scope.$apply();
                }, 1000);
              }
            }
          },
          7: function ($scope, test) {
            if (test.data[0] !== 1) {
              $scope.results = "X (7) First element in array was not removed.";
            } else { 
              $scope.results = "√ (7) Array shifted by 1...";
              $scope.actions = "(8) Deleting array and creating a multi-tier object.";
              test.data = {a: [0, 1, 2], b: ['zero', 'one', 'two']}
              test.data.c = test.data.a;
              test.stage = 8;
            }
          },
          9: function ($scope, test, listing) { 
            if (test.data.a[3] !== test.data.b) { 
              $scope.results = "X (9) The object data.a[3] does not refer to data.b.";
            } else { 
              $scope.results = "√ (9) Good work soldier, complex graph relations appear to work.";
              $scope.actions = "(10) Modifying a read only variable. Waiting on a (failed) reference of the readonly variable from a global one.";
              listing['WHOA'].a = 10000;
              test.stage = 10;
            }
          },
          10: function ($scope, test, listing, changes) {
            var readonly = listing['WHOA'];
            if (changes.type === 'delete') {
              if (readonly[changes.property] === undefined) {
                $scope.results = "√ (10) Readonly variable successfully unmodified.";
                $scope.actions = "Waiting for stage 13.";
                test.stage = 11;
              } else {
                $scope.results = "X (10) changes to Readonly variable has retained its illegal changes."
              }
            }
            else {
              $scope.results = "X (10) Received the wrong command.";
            }
          },
          13: function ($scope, test, listing, changes) {
            var readonly = listing['GO'];
            $scope.actions = "(13) Changing a variable nested deep within a readonly variable.";
            readonly[0].a[0] = 1;
            test.stage = 14;
          },
          14: function ($scope, test, listing, changes) {
            if (changes.type === 'update') {
              if (listing('GO')[0].a[0] === 0) {
                $scope.results = "√ (14) Complex readonly is unmodifiable.";
              } else { 
                $scope.results = "X (14) Readonly variable has been illegally changed.";
              }
            } else {
              $scope.results = "X (14) Got the wrong command: " + changes.type + ".";
            }
          },
          success: function ($scope, test) { 
            $scope.actions = "√ All tests passed successfully. End of test.";
            $scope.results = "√ All tests passed successfully. End of test.";
          }
        }
      ];

      var test = Syc.list('NO'),
          listing = Syc.list();

      if (test.started && $scope.role !== undefined) { 
        var role = $scope.role,
            stage = test.stage;

        var func = testsuite[role][stage];
        if (func) func($scope, test, listing, changes);
      }
    }
});
