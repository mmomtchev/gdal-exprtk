{
    'variables': {
    'enable_asan%': 'false',
    'enable_coverage%': 'false',
  },
  'target_defaults': {
    'cflags!': [ '-fno-exceptions', '-fno-rtti', '-fvisibility=default' ],
    'cflags_cc!': [ '-fno-exceptions', '-fno-rtti', '-fvisibility=default' ],
    'cflags_cc': [ '-fvisibility=hidden', '-std=c++17' ],
    'ldflags': [ '-Wl,-z,now' ],
    'xcode_settings': {
      'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
			'GCC_ENABLE_CPP_RTTI': 'YES',
      'CLANG_CXX_LIBRARY': 'libc++',
			'OTHER_CPLUSPLUSFLAGS': [
				'-frtti',
				'-fexceptions',
		        '-std=c++17'
			],
	},
	'conditions': [
		['OS == "linux"', {
			"include_dirs": [
				"node_modules/gdal-async/deps/libgdal/arch/unix"
			]
		}],
		['OS == "mac"', {
			"include_dirs": [
				"node_modules/gdal-async/deps/libgdal/arch/unix"
			]
		}],
		['OS == "win"', {
			"include_dirs": [
				"node_modules/gdal-async/deps/libgdal/arch/win"
			]
		}]
	],
    'msvs_settings': {
      'VCCLCompilerTool': {
        'AdditionalOptions': [
          '/MP',
          '/GR',
          '/EHsc',
          '/wd4146',
          '/wd4723',
          '/std:c++17'
        ],
        'ExceptionHandling': 1,
        'RuntimeTypeInfo': 'true'
      }
    },
    'configurations': {
      'Debug': {
        'cflags_cc!': [ '-O3', '-Os' ],
        'defines': [  'DEBUG' ],
        'defines!': [ 'NDEBUG' ],
        'xcode_settings': {
          'GCC_OPTIMIZATION_LEVEL': '0',
          'GCC_GENERATE_DEBUGGING_SYMBOLS': 'YES',
        }
      },
      'Release': {
        'defines': [ 'NDEBUG' ],
        'defines!': [ 'DEBUG' ],
        'xcode_settings': {
          'GCC_OPTIMIZATION_LEVEL': 's',
          'GCC_GENERATE_DEBUGGING_SYMBOLS': 'NO',
          'DEAD_CODE_STRIPPING': 'YES',
          'GCC_INLINES_ARE_PRIVATE_EXTERN': 'YES'
        },
        'ldflags': [
          '-Wl,-s'
        ],
        'msvs_settings': {
          'VCCLCompilerTool': {
            'DebugInformationFormat': '0',
          },
          'VCLinkerTool': {
            'GenerateDebugInformation': 'false',
          }
        }
      }
    }
  },
  'targets': [
    {
      'target_name': 'gdal-exprtk',
      'sources': [
        'src/pixelFn.cc'
      ],
      'include_dirs': [
        'node_modules/gdal-async/include',
		'node_modules/gdal-async/deps/libgdal/gdal/alg',
		'node_modules/gdal-async/deps/libgdal/gdal/gcore',
		'node_modules/gdal-async/deps/libgdal/gdal/port',
		'node_modules/gdal-async/deps/libgdal/gdal/apps',
		'node_modules/gdal-async/deps/libgdal/gdal/ogr',
		'node_modules/gdal-async/deps/libgdal/gdal/ogr/ogrsf_frmts',
        'node_modules/exprtk.js/include',
        '<!@(node -p "require(\'node-addon-api\').include")'
      ],
      'dependencies': ['<!(node -p "require(\'node-addon-api\').gyp")'],
      'conditions': [
        ['enable_asan == "true"', {
          'cflags_cc': [ '-fsanitize=address' ],
          'ldflags' : [ '-fsanitize=address' ]
        }],
        ["enable_coverage == 'true'", {
          'cflags_cc': [ '-fprofile-arcs', '-ftest-coverage' ],
          'ldflags' : [ '-lgcov', '--coverage' ]
        }]
      ]
    },
    {
      'target_name': 'action_after_build',
      'type': 'none',
      'dependencies': [ '<(module_name)' ],
      'copies': [
        {
          'files': [
            '<(PRODUCT_DIR)/gdal-exprtk.node',
          ],
          'destination': '<(module_path)'
        }
      ]
    }
  ]
}
